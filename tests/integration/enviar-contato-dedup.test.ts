import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";

// enviarContato/enviarAnuncioProprietario (src/app/[orgSlug]/actions.ts)
// importam @/lib/tenant, que importa @/lib/auth, que importa next-auth,
// que importa next/server — não resolve sob Vitest puro (mesma limitação
// já documentada nesta sessão). Mock evita a resolução do módulo real,
// mesmo que nenhuma das duas actions chame auth() de fato (são ações
// públicas, sem sessão).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

// protecoesAntiSpam chama headers() de next/headers, que exige o request
// store do runtime do Next. Mock devolve um Headers vazio — cai no
// fallback "IP desconhecido" de obterIpCliente, sem erro.
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

// buscarConfiguracaoContato usa unstable_cache (mesma limitação já
// documentada no trabalho de favicon) — substitui por uma função
// identidade que só chama o callback direto, sem cache nenhum. Preserva o
// comportamento real (mesma query), só remove o mecanismo de cache que
// exige o runtime do Next.
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
}));

import { enviarContato, enviarAnuncioProprietario } from "@/app/[orgSlug]/actions";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(fields)) fd.set(chave, valor);
  // renderizadoEm precisa ser "antigo" o bastante pra passar da checagem
  // anti-bot de tempo mínimo (protecoesAntiSpam, LIMIAR_MUITO_RAPIDO_MS).
  fd.set("renderizadoEm", String(Date.now() - 5000));
  return fd;
}

describe("enviarContato — deduplicação de leads", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("primeira submissão cria Person + Interaction; resposta pública genérica", async () => {
    cenario = await criarCenario();
    const resultado = await enviarContato(
      cenario.organization.slug,
      undefined,
      formData({
        nome: "Visitante",
        email: "visitante@email.com",
        telefone: "",
        mensagem: "Quero saber mais sobre este imóvel.",
      })
    );

    expect(resultado).toEqual({ sucesso: true });

    const pessoa = await prisma.person.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, emailNormalized: "visitante@email.com" },
    });
    const interacoes = await prisma.interaction.findMany({
      where: { organizationId: cenario.organization.id, personId: pessoa.id },
    });
    expect(interacoes).toHaveLength(1);
    expect(interacoes[0].type).toBe("MESSAGE");
  });

  test("E) conflito de identidade: não cria Person nova, não cria Interaction, resposta pública igual à de sucesso", async () => {
    cenario = await criarCenario();
    const orgId = cenario.organization.id;

    const pessoaA = await criarPessoa({ organizationId: orgId, email: "conflito-a@email.com" });
    const pessoaB = await prisma.person.create({
      data: {
        organizationId: orgId,
        name: "Pessoa B",
        phone: "(11) 90000-1111",
        phoneNormalized: "11900001111",
        roles: ["LEAD"],
      },
    });

    const totalAntes = await prisma.person.count({ where: { organizationId: orgId } });
    const interacoesAntes = await prisma.interaction.count({ where: { organizationId: orgId } });

    const resultado = await enviarContato(
      cenario.organization.slug,
      undefined,
      formData({
        nome: "Visitante Conflitante",
        email: "conflito-a@email.com", // bate com A
        telefone: "(11) 90000-1111", // bate com B
        mensagem: "Mensagem de teste de conflito.",
      })
    );

    // Resposta pública idêntica à do caminho de sucesso — o visitante
    // nunca sabe que houve um conflito interno.
    expect(resultado).toEqual({ sucesso: true });

    const totalDepois = await prisma.person.count({ where: { organizationId: orgId } });
    const interacoesDepois = await prisma.interaction.count({ where: { organizationId: orgId } });
    expect(totalDepois).toBe(totalAntes);
    expect(interacoesDepois).toBe(interacoesAntes);

    const aAposTentativa = await prisma.person.findUniqueOrThrow({
      where: { id: pessoaA.id, organizationId: orgId },
    });
    const bAposTentativa = await prisma.person.findUniqueOrThrow({
      where: { id: pessoaB.id, organizationId: orgId },
    });
    expect(aAposTentativa.name).toBe("Pessoa de teste");
    expect(bAposTentativa.name).toBe("Pessoa B");
  });

  test("M) propertyId de outra organização continua rejeitado (não vira o propertyId da Interaction)", async () => {
    cenario = await criarCenario();
    const outraOrg = await criarCenario();
    try {
      const imovelDeOutraOrg = await criarImovel({ organizationId: outraOrg.organization.id });

      await enviarContato(
        cenario.organization.slug,
        undefined,
        formData({
          nome: "Visitante",
          email: "cross-tenant@email.com",
          telefone: "",
          mensagem: "Tentando referenciar imóvel de outro tenant.",
          imovelId: imovelDeOutraOrg.id,
        })
      );

      const pessoa = await prisma.person.findFirstOrThrow({
        where: { organizationId: cenario.organization.id, emailNormalized: "cross-tenant@email.com" },
      });
      const interacao = await prisma.interaction.findFirstOrThrow({
        where: { organizationId: cenario.organization.id, personId: pessoa.id },
      });
      expect(interacao.propertyId).toBeNull();
    } finally {
      await outraOrg.destruir();
    }
  });
});

describe("enviarAnuncioProprietario — deduplicação de leads", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("Person LEAD existente que envia 'Anuncie seu imóvel' ganha OWNER sem perder LEAD", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({
      organizationId: cenario.organization.id,
      email: "lead-vira-owner@email.com",
      roles: ["LEAD"],
    });

    const resultado = await enviarAnuncioProprietario(
      cenario.organization.slug,
      undefined,
      formData({
        nome: "Lead Vira Owner",
        email: "lead-vira-owner@email.com",
        telefone: "11966665555",
        descricaoImovel: "Apartamento de 2 quartos pra anunciar.",
      })
    );
    expect(resultado).toEqual({ sucesso: true });

    const atualizado = await prisma.person.findUniqueOrThrow({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(atualizado.roles).toEqual(["LEAD", "OWNER"]);

    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
  });
});

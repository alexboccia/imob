import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { criarCenario, criarPessoa, criarImovel, criarUsuario, criarMembro } from "@/test/fixtures";
import { enviarContato, enviarAnuncioProprietario } from "@/app/[orgSlug]/actions";
import { resolverCaptacaoPendente } from "@/app/app/captacoes/actions";
import {
  buscarCaptacoesPendentes,
  contarCaptacoesPendentes,
} from "@/lib/captacao-pendente";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// =======================================================================
// Garantia de captura (Fase 24) — contra o banco
// =======================================================================
// A afirmação sob teste: NENHUM contato publicamente aceito desaparece,
// mesmo quando o sistema não sabe de quem ele é.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

function autenticarComo(cenario: Cenario, role = "OWNER", membroId?: string) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: membroId ?? cenario.membro.id,
      role,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  fd.set("renderizadoEm", String(Date.now() - 5000));
  return fd;
}

// Duas pessoas que colidem: o e-mail aponta pra uma, o telefone pra
// outra. É a única situação em que o dedupe público se recusa a decidir.
async function pessoasEmConflito(orgId: string, sufixo: string) {
  const a = await criarPessoa({ organizationId: orgId, email: `conflito-${sufixo}@email.com` });
  const b = await prisma.person.create({
    data: {
      organizationId: orgId,
      name: `Pessoa B ${sufixo}`,
      phone: "(11) 90000-1111",
      phoneNormalized: "11900001111",
      roles: ["LEAD"],
    },
  });
  return { a, b };
}

describe("captação pendente — o contato ambíguo é guardado", () => {
  test("enviarContato com identidade ambígua persiste LeadCapture antes de responder sucesso", async () => {
    const cenario = await novoCenario();
    const orgId = cenario.organization.id;
    await pessoasEmConflito(orgId, "contato");
    const imovel = await criarImovel({ organizationId: orgId });

    const resultado = await enviarContato(
      cenario.organization.slug,
      undefined,
      formData({
        nome: "Visitante Conflitante",
        email: "conflito-contato@email.com",
        telefone: "(11) 90000-1111",
        mensagem: "Tenho interesse neste imóvel.",
        imovelId: imovel.id,
        // A atribuição chega como um único campo JSON (Fase 7), saneada
        // no servidor — não como parâmetros soltos.
        atribuicao: JSON.stringify({ utmSource: "google", utmCampaign: "primavera" }),
      })
    );

    // O visitante recebe exatamente a mesma resposta do caminho feliz —
    // e agora ela é VERDADEIRA: o fato comercial está no banco.
    expect(resultado).toEqual({ sucesso: true });

    const captacao = await prisma.leadCapture.findFirstOrThrow({
      where: { organizationId: orgId },
    });
    expect(captacao.status).toBe("PENDING");
    expect(captacao.name).toBe("Visitante Conflitante");
    expect(captacao.email).toBe("conflito-contato@email.com");
    expect(captacao.message).toBe("Tenho interesse neste imóvel.");
    expect(captacao.propertyId).toBe(imovel.id);
    expect(captacao.role).toBe("LEAD");
    // A atribuição de tráfego sobrevive: sem ela o contato existiria,
    // mas a origem que o gerou estaria perdida para sempre.
    expect(captacao.utmSource).toBe("google");
    expect(captacao.utmCampaign).toBe("primavera");
    expect(captacao.resolvedAt).toBeNull();
    expect(captacao.resolvedInteractionId).toBeNull();

    // Nenhuma Person inventada, nenhum cadastro tocado.
    expect(await prisma.person.count({ where: { organizationId: orgId } })).toBe(2);
    expect(await prisma.interaction.count({ where: { organizationId: orgId } })).toBe(0);
  });

  test("enviarAnuncioProprietario ambíguo também é guardado, com papel OWNER", async () => {
    const cenario = await novoCenario();
    const orgId = cenario.organization.id;
    await pessoasEmConflito(orgId, "anuncie");

    const resultado = await enviarAnuncioProprietario(
      cenario.organization.slug,
      undefined,
      formData({
        nome: "Proprietário Conflitante",
        email: "conflito-anuncie@email.com",
        telefone: "(11) 90000-1111",
        descricaoImovel: "Casa com 3 quartos no centro.",
      })
    );
    expect(resultado).toEqual({ sucesso: true });

    const captacao = await prisma.leadCapture.findFirstOrThrow({
      where: { organizationId: orgId },
    });
    // O contato de quem quer ANUNCIAR não pode ser arquivado como lead
    // comprador: a intenção declarada faz parte do fato.
    expect(captacao.role).toBe("OWNER");
    expect(captacao.message).toContain("Casa com 3 quartos no centro.");
    expect(captacao.propertyId).toBeNull();
  });

  test("a fila mostra os dois candidatos, cada um com o motivo do match", async () => {
    const cenario = await novoCenario();
    const orgId = cenario.organization.id;
    const { a, b } = await pessoasEmConflito(orgId, "fila");

    await enviarContato(
      cenario.organization.slug,
      undefined,
      formData({
        nome: "Visitante",
        email: "conflito-fila@email.com",
        telefone: "(11) 90000-1111",
        mensagem: "Tenho interesse e gostaria de mais detalhes.",
      })
    );

    expect(await contarCaptacoesPendentes(orgId)).toBe(1);
    const [pendente] = await buscarCaptacoesPendentes(orgId);
    const porId = new Map(pendente.candidatos.map((c) => [c.personId, c]));
    expect(porId.get(a.id)).toMatchObject({ porEmail: true, porTelefone: false });
    expect(porId.get(b.id)).toMatchObject({ porEmail: false, porTelefone: true });
  });

  test("candidatos são recalculados: apagar um cadastro muda a fila, sem apagar o contato", async () => {
    const cenario = await novoCenario();
    const orgId = cenario.organization.id;
    const { a, b } = await pessoasEmConflito(orgId, "recalculo");

    await enviarContato(
      cenario.organization.slug,
      undefined,
      formData({
        nome: "Visitante",
        email: "conflito-recalculo@email.com",
        telefone: "(11) 90000-1111",
        mensagem: "Tenho interesse e gostaria de mais detalhes.",
      })
    );

    await prisma.person.delete({ where: { id: b.id, organizationId: orgId } });

    const [pendente] = await buscarCaptacoesPendentes(orgId);
    // O contato continua existindo — só o conjunto de candidatos mudou.
    expect(pendente.candidatos.map((c) => c.personId)).toEqual([a.id]);
    expect(await contarCaptacoesPendentes(orgId)).toBe(1);
  });
});

describe("resolução de identidade", () => {
  async function comCaptacaoPendente(sufixo: string) {
    const cenario = await novoCenario();
    const orgId = cenario.organization.id;
    const { a, b } = await pessoasEmConflito(orgId, sufixo);
    await enviarContato(
      cenario.organization.slug,
      undefined,
      formData({
        nome: "Visitante",
        email: `conflito-${sufixo}@email.com`,
        telefone: "(11) 90000-1111",
        mensagem: "Quero visitar.",
      })
    );
    const captacao = await prisma.leadCapture.findFirstOrThrow({ where: { organizationId: orgId } });
    return { cenario, orgId, a, b, captacao };
  }

  test("resolver cria UMA Interaction, no instante ORIGINAL do envio, sem autor", async () => {
    const { cenario, orgId, a, captacao } = await comCaptacaoPendente("resolver");
    autenticarComo(cenario);

    const estado = await resolverCaptacaoPendente(
      captacao.id,
      ESTADO_INICIAL_ACAO,
      formData({ personId: a.id })
    );
    expect(estado.success).toBe(true);

    const interacoes = await prisma.interaction.findMany({ where: { organizationId: orgId } });
    expect(interacoes).toHaveLength(1);
    expect(interacoes[0].personId).toBe(a.id);
    expect(interacoes[0].notes).toBe("Quero visitar.");
    // O CONTATO ACONTECEU QUANDO O VISITANTE ENVIOU, não quando o gestor
    // resolveu — é isso que mantém o Analytics honesto.
    expect(interacoes[0].occurredAt.getTime()).toBe(captacao.occurredAt.getTime());
    expect(interacoes[0].origin).toBe(captacao.origin);
    // Quem resolveu NÃO é o autor: o contato nasceu do visitante.
    expect(interacoes[0].memberId).toBeNull();

    const depois = await prisma.leadCapture.findFirstOrThrow({ where: { id: captacao.id, organizationId: orgId } });
    expect(depois.status).toBe("RESOLVED");
    expect(depois.resolvedPersonId).toBe(a.id);
    expect(depois.resolvedByMemberId).toBe(cenario.membro.id);
    expect(depois.resolvedInteractionId).toBe(interacoes[0].id);
    expect(await contarCaptacoesPendentes(orgId)).toBe(0);
  });

  test("resolver NÃO sobrescreve e-mail nem telefone do cadastro escolhido", async () => {
    const { cenario, orgId, b, captacao } = await comCaptacaoPendente("sem-sobrescrita");
    autenticarComo(cenario);
    const antes = await prisma.person.findUniqueOrThrow({ where: { id: b.id, organizationId: orgId } });

    await resolverCaptacaoPendente(captacao.id, ESTADO_INICIAL_ACAO, formData({ personId: b.id }));

    const depois = await prisma.person.findUniqueOrThrow({ where: { id: b.id, organizationId: orgId } });
    expect(depois.email).toBe(antes.email);
    expect(depois.phone).toBe(antes.phone);
    expect(depois.name).toBe(antes.name);
  });

  test("duas resoluções simultâneas: uma vence, nenhuma Interaction duplicada", async () => {
    const { cenario, orgId, a, b, captacao } = await comCaptacaoPendente("corrida");
    autenticarComo(cenario);

    const resultados = await Promise.all([
      resolverCaptacaoPendente(captacao.id, ESTADO_INICIAL_ACAO, formData({ personId: a.id })),
      resolverCaptacaoPendente(captacao.id, ESTADO_INICIAL_ACAO, formData({ personId: b.id })),
    ]);

    // Nenhuma das duas é ERRO para quem clicou — a segunda apenas
    // descobre que o trabalho já estava feito.
    expect(resultados.every((r) => r.success)).toBe(true);
    expect(await prisma.interaction.count({ where: { organizationId: orgId } })).toBe(1);

    const depois = await prisma.leadCapture.findFirstOrThrow({ where: { id: captacao.id, organizationId: orgId } });
    expect(depois.status).toBe("RESOLVED");
    // O vencedor é UM dos dois, e a Interaction pertence a ele.
    const interacao = await prisma.interaction.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(interacao.personId).toBe(depois.resolvedPersonId);
    expect(depois.resolvedInteractionId).toBe(interacao.id);
  });

  test("resolver de novo, em sequência, não cria uma segunda Interaction", async () => {
    const { cenario, orgId, a, captacao } = await comCaptacaoPendente("repetida");
    autenticarComo(cenario);

    await resolverCaptacaoPendente(captacao.id, ESTADO_INICIAL_ACAO, formData({ personId: a.id }));
    const segunda = await resolverCaptacaoPendente(
      captacao.id,
      ESTADO_INICIAL_ACAO,
      formData({ personId: a.id })
    );

    expect(segunda.success).toBe(true);
    expect(await prisma.interaction.count({ where: { organizationId: orgId } })).toBe(1);
  });

  test("BROKER não resolve — e a captação continua pendente", async () => {
    const { cenario, orgId, a, captacao } = await comCaptacaoPendente("broker");
    const usuario = await criarUsuario({ name: "Corretor" });
    const membro = await criarMembro({
      organizationId: orgId,
      userId: usuario.id,
      role: "BROKER",
    });
    autenticarComo(cenario, "BROKER", membro.id);

    const estado = await resolverCaptacaoPendente(
      captacao.id,
      ESTADO_INICIAL_ACAO,
      formData({ personId: a.id })
    );

    expect(estado.success).toBe(false);
    expect(await prisma.interaction.count({ where: { organizationId: orgId } })).toBe(0);
    const depois = await prisma.leadCapture.findFirstOrThrow({ where: { id: captacao.id, organizationId: orgId } });
    expect(depois.status).toBe("PENDING");
  });

  test("IDOR: captação de outra organização não é resolvível nem visível", async () => {
    const alvo = await comCaptacaoPendente("vitima");
    const atacante = await novoCenario();
    autenticarComo(atacante);

    const estado = await resolverCaptacaoPendente(
      alvo.captacao.id,
      ESTADO_INICIAL_ACAO,
      formData({ personId: alvo.a.id })
    );

    expect(estado.success).toBe(false);
    // A mensagem não confirma nem nega a existência do recurso alheio.
    expect(estado.message).toBe("Contato não encontrado.");
    const depois = await prisma.leadCapture.findFirstOrThrow({
      where: { id: alvo.captacao.id, organizationId: alvo.orgId },
    });
    expect(depois.status).toBe("PENDING");
    expect(await contarCaptacoesPendentes(atacante.organization.id)).toBe(0);
  });

  test("personId de outra organização é recusado (a captação não é vinculada a um estranho)", async () => {
    const { cenario, orgId, captacao } = await comCaptacaoPendente("cross-person");
    const outra = await novoCenario();
    const pessoaDeOutraOrg = await criarPessoa({ organizationId: outra.organization.id });
    autenticarComo(cenario);

    const estado = await resolverCaptacaoPendente(
      captacao.id,
      ESTADO_INICIAL_ACAO,
      formData({ personId: pessoaDeOutraOrg.id })
    );

    expect(estado.success).toBe(false);
    expect(await prisma.interaction.count({ where: { organizationId: orgId } })).toBe(0);
    const depois = await prisma.leadCapture.findFirstOrThrow({ where: { id: captacao.id, organizationId: orgId } });
    expect(depois.status).toBe("PENDING");
  });
});

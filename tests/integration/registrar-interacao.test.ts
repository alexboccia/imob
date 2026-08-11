import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa } from "@/test/fixtures";

// registrarInteracao (src/app/app/clientes/actions.ts) importa @/lib/auth,
// que importa next-auth, que importa next/server — não resolve sob Vitest
// puro (mesma limitação já documentada no trabalho de favicon desta
// sessão: "Cannot find module 'next/server'"). Mock substitui o módulo
// inteiro antes dele ser avaliado, então next-auth nunca chega a ser
// carregado — não precisa mudar nada em actions.ts pra isso.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

// revalidatePath exige o request store do runtime do Next (indisponível
// chamando a action direto sob Vitest — "Invariant: static generation
// store missing"). É só invalidação de cache, não afeta a escrita no
// banco nem a checagem de tenant que este teste audita — mock evita o
// invariant sem mudar nada em actions.ts.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { registrarInteracao } from "@/app/app/clientes/actions";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(fields)) fd.set(chave, valor);
  return fd;
}

function autenticarComo(cenario: {
  organization: { id: string };
  membro: { id: string };
  usuario: { id: string };
}) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// registrarInteracao é a Server Action de src/app/app/clientes/actions.ts
// que recebe pessoaId como argumento — input do navegador como qualquer
// outro, não confiável. A correção auditada aqui garante que uma
// Interaction só é criada quando pessoaId pertence à organização de quem
// está autenticado.
describe("registrarInteracao — isolamento de tenant", () => {
  let cenarioA: Awaited<ReturnType<typeof criarCenario>> | undefined;
  let cenarioB: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  test("A) membro da Organization A registra Interaction em Person da própria organização — permitido", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA);
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });

    await registrarInteracao(pessoa.id, formData({ tipo: "CALL", notas: "Ligação de teste" }));

    const interacoes = await prisma.interaction.findMany({
      where: { personId: pessoa.id, organizationId: cenarioA.organization.id },
    });
    expect(interacoes).toHaveLength(1);
    expect(interacoes[0].type).toBe("CALL");
    expect(interacoes[0].notes).toBe("Ligação de teste");
  });

  test("B) membro da Organization A tenta registrar Interaction em Person da Organization B — rejeitado", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA);
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });

    await expect(
      registrarInteracao(pessoaB.id, formData({ tipo: "CALL", notas: "tentativa cross-tenant" }))
    ).resolves.toBeUndefined();

    // C) nenhuma Interaction foi criada — nem em nome de A, nem de B.
    const interacoesDoPessoaB = await prisma.interaction.findMany({
      where: { personId: pessoaB.id, organizationId: cenarioB.organization.id },
    });
    expect(interacoesDoPessoaB).toHaveLength(0);

    const totalEmA = await prisma.interaction.count({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(totalEmA).toBe(0);
  });

  test("D) pessoaId inexistente é rejeitado do mesmo jeito que cross-tenant, sem lançar erro que revele algo", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA);

    await expect(
      registrarInteracao("pessoa-que-nao-existe-em-lugar-nenhum", formData({ tipo: "CALL" }))
    ).resolves.toBeUndefined();

    const totalEmA = await prisma.interaction.count({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(totalEmA).toBe(0);
  });

  test("E) organizationId da Interaction criada é sempre o da sessão, nunca outro", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA);
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });

    await registrarInteracao(pessoa.id, formData({ tipo: "EMAIL" }));

    const interacao = await prisma.interaction.findFirstOrThrow({
      where: { personId: pessoa.id, organizationId: cenarioA.organization.id },
    });
    expect(interacao.organizationId).toBe(cenarioA.organization.id);
  });

  test("F) memberId é sempre o membro autenticado, nunca fornecido pelo cliente", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA);
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });

    // formData não tem (e nunca teve) um campo memberId — interacaoSchema
    // só aceita "tipo" e "notas". Mesmo assim, tentar injetar um valor
    // não declarado no schema pra confirmar que é ignorado.
    await registrarInteracao(
      pessoa.id,
      formData({ tipo: "VISIT", memberId: "membro-forjado-pelo-cliente" })
    );

    const interacao = await prisma.interaction.findFirstOrThrow({
      where: { personId: pessoa.id, organizationId: cenarioA.organization.id },
    });
    expect(interacao.memberId).toBe(cenarioA.membro.id);
  });
});

import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
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
import {
  criarCenario,
  criarPessoa as criarPessoaFixture,
  criarImovel,
  criarUsuario,
  criarMembro,
} from "@/test/fixtures";
import { atualizarPessoa } from "@/app/app/clientes/actions";

// =======================================================================
// Fase 114 — editar os dados cadastrais de uma Person já existente
// =======================================================================
// Até aqui não existia NENHUMA via para corrigir nome/e-mail/telefone/
// observações depois do cadastro (achado da Fase 112, reconfirmado por
// grep exaustivo antes de implementar). Estes testes provam que a nova
// action preserva o MESMO contrato de identidade de criarPessoa — nunca
// um segundo conjunto de regras — e nunca "resolve" uma edição para outra
// Person.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];

afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(
  visibilidade: "COLLABORATIVE" | "RESTRICTED" = "COLLABORATIVE"
): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  if (visibilidade === "RESTRICTED") {
    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { commercialVisibility: "RESTRICTED" },
    });
  }
  return cenario;
}

function autenticarComo(cenario: Cenario, overrides: Record<string, unknown> = {}) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
      ...overrides,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function form(valores: { nome?: string; email?: string; telefone?: string; observacoes?: string }) {
  const fd = new FormData();
  if (valores.nome !== undefined) fd.set("nome", valores.nome);
  if (valores.email !== undefined) fd.set("email", valores.email);
  if (valores.telefone !== undefined) fd.set("telefone", valores.telefone);
  if (valores.observacoes !== undefined) fd.set("observacoes", valores.observacoes);
  return fd;
}

async function pessoaAtual(id: string, organizationId: string) {
  return prisma.person.findUniqueOrThrow({ where: { id, organizationId } });
}

describe("atualizarPessoa — identidade e normalização", () => {
  test("edita o nome", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id, name: "Antigo" });

    const estado = await atualizarPessoa(p.id, { success: false }, form({ nome: "Novo Nome" }));
    expect(estado.success).toBe(true);
    expect((await pessoaAtual(p.id, c.organization.id)).name).toBe("Novo Nome");
  });

  test("edita o e-mail, e emailNormalized acompanha na mesma escrita", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id });

    await atualizarPessoa(p.id, { success: false }, form({ nome: "Xx", email: "Novo@Email.COM" }));
    const atual = await pessoaAtual(p.id, c.organization.id);
    expect(atual.email).toBe("Novo@Email.COM");
    expect(atual.emailNormalized).toBe("novo@email.com");
  });

  test("casing diferente do mesmo e-mail não colide consigo mesma", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id, email: "joao@email.com" });

    const estado = await atualizarPessoa(
      p.id,
      { success: false },
      form({ nome: "João", email: "JOAO@EMAIL.COM" })
    );
    expect(estado.success).toBe(true);
  });

  test("remover o e-mail grava null nos dois campos", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id, email: "sai@email.com" });

    await atualizarPessoa(p.id, { success: false }, form({ nome: "Xx", email: "" }));
    const atual = await pessoaAtual(p.id, c.organization.id);
    expect(atual.email).toBeNull();
    expect(atual.emailNormalized).toBeNull();
  });

  test("adicionar e-mail a quem não tinha", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id });

    await atualizarPessoa(p.id, { success: false }, form({ nome: "Xx", email: "chegou@email.com" }));
    expect((await pessoaAtual(p.id, c.organization.id)).emailNormalized).toBe("chegou@email.com");
  });

  test("conflito de e-mail com OUTRA pessoa da mesma organização é recusado, não 500", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    await criarPessoaFixture({ organizationId: c.organization.id, email: "ocupado@email.com" });
    const alvo = await criarPessoaFixture({ organizationId: c.organization.id, email: "livre@email.com" });

    const estado = await atualizarPessoa(
      alvo.id,
      { success: false },
      form({ nome: "Xx", email: "ocupado@email.com" })
    );
    expect(estado.success).toBe(false);
    expect(estado.message).toMatch(/já existe/i);
    // A edição NÃO resolveu pra outra Person nem alterou a vítima do conflito.
    expect((await pessoaAtual(alvo.id, c.organization.id)).emailNormalized).toBe("livre@email.com");
  });

  test("o mesmo e-mail em OUTRO tenant continua permitido", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    await criarPessoaFixture({ organizationId: b.organization.id, email: "comum@email.com" });
    autenticarComo(a);
    const alvo = await criarPessoaFixture({ organizationId: a.organization.id });

    const estado = await atualizarPessoa(
      alvo.id,
      { success: false },
      form({ nome: "Xx", email: "comum@email.com" })
    );
    expect(estado.success).toBe(true);
  });

  test("edita telefone, e formatação diferente normaliza igual", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id });

    await atualizarPessoa(p.id, { success: false }, form({ nome: "Xx", telefone: "(11) 99999-9999" }));
    const atual = await pessoaAtual(p.id, c.organization.id);
    expect(atual.phoneNormalized).toBe("11999999999");
  });

  test("remover telefone grava null nos dois campos", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id, phone: "11988887777" });

    await atualizarPessoa(p.id, { success: false }, form({ nome: "Xx", telefone: "" }));
    const atual = await pessoaAtual(p.id, c.organization.id);
    expect(atual.phone).toBeNull();
    expect(atual.phoneNormalized).toBeNull();
  });

  test("conflito de telefone com OUTRA pessoa da mesma organização é recusado", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    await criarPessoaFixture({ organizationId: c.organization.id, phone: "11911112222" });
    const alvo = await criarPessoaFixture({ organizationId: c.organization.id, phone: "11933334444" });

    const estado = await atualizarPessoa(
      alvo.id,
      { success: false },
      form({ nome: "Xx", telefone: "(11) 91111-2222" })
    );
    expect(estado.success).toBe(false);
    expect(estado.message).toMatch(/já existe/i);
  });

  test("o mesmo telefone em OUTRO tenant continua permitido", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    await criarPessoaFixture({ organizationId: b.organization.id, phone: "11999998888" });
    autenticarComo(a);
    const alvo = await criarPessoaFixture({ organizationId: a.organization.id });

    const estado = await atualizarPessoa(
      alvo.id,
      { success: false },
      form({ nome: "Xx", telefone: "(11) 99999-8888" })
    );
    expect(estado.success).toBe(true);
  });

  test("telefone inválido é recusado com erro de campo", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id });

    const estado = await atualizarPessoa(p.id, { success: false }, form({ nome: "Xx", telefone: "123" }));
    expect(estado.success).toBe(false);
    expect(estado.fieldErrors?.telefone?.[0]).toBeTruthy();
  });

  test("edição sem nenhuma alteração funciona e não produz efeito colateral", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({
      organizationId: c.organization.id,
      name: "Igual",
      email: "igual@email.com",
      phone: "11977776666",
    });

    const estado = await atualizarPessoa(
      p.id,
      { success: false },
      form({ nome: "Igual", email: "igual@email.com", telefone: "(11) 97777-6666" })
    );
    expect(estado.success).toBe(true);
    expect(
      await prisma.interaction.count({ where: { personId: p.id, organizationId: c.organization.id } })
    ).toBe(0);
    expect(
      await prisma.propertyInterest.count({ where: { personId: p.id, organizationId: c.organization.id } })
    ).toBe(0);
  });

  test("identificador antigo é liberado depois da troca", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id, email: "velho@email.com" });

    const estado = await atualizarPessoa(p.id, { success: false }, form({ nome: "Xx", email: "novo@email.com" }));
    expect(estado.success).toBe(true);

    // O e-mail velho não está mais em uso — uma Person NOVA pode usá-lo.
    const outra = await prisma.person.create({
      data: {
        organizationId: c.organization.id,
        name: "Outra",
        email: "velho@email.com",
        emailNormalized: "velho@email.com",
        roles: ["LEAD"],
      },
    });
    expect(outra.id).toBeTruthy();
  });
});

describe("atualizarPessoa — negociações e preferências permanecem intactas", () => {
  test("PropertyInterest, PersonPreference e Interaction não são tocados", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id, purpose: "SALE", price: 100000 });
    const interesse = await prisma.propertyInterest.create({
      data: { organizationId: c.organization.id, personId: p.id, propertyId: imovel.id, stage: "INTERESTED" },
    });
    await prisma.personPreference.create({
      data: { personId: p.id, organizationId: c.organization.id, transactionType: "SALE" },
    });
    const interacao = await prisma.interaction.create({
      data: { organizationId: c.organization.id, personId: p.id, type: "CALL", occurredAt: new Date() },
    });

    await atualizarPessoa(p.id, { success: false }, form({ nome: "Outro Nome" }));

    const interesseDepois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse.id, organizationId: c.organization.id },
    });
    expect(interesseDepois.stage).toBe("INTERESTED");
    expect(interesseDepois.createdAt).toEqual(interesse.createdAt);
    expect(
      await prisma.personPreference.findUnique({
        where: { personId: p.id, organizationId: c.organization.id },
      })
    ).not.toBeNull();
    expect(
      await prisma.interaction.findUnique({
        where: { id: interacao.id, organizationId: c.organization.id },
      })
    ).not.toBeNull();
  });
});

describe("atualizarPessoa — autorização, tenant e escopo", () => {
  test("Person inexistente é recusada de forma genérica", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const estado = await atualizarPessoa("id-inexistente", { success: false }, form({ nome: "Xx" }));
    expect(estado.success).toBe(false);
  });

  test("IDOR: Person de OUTRA organização não é editável", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const pessoaDeB = await criarPessoaFixture({ organizationId: b.organization.id, name: "De B" });
    autenticarComo(a);

    const estado = await atualizarPessoa(pessoaDeB.id, { success: false }, form({ nome: "Sequestrado" }));
    expect(estado.success).toBe(false);
    expect((await pessoaAtual(pessoaDeB.id, b.organization.id)).name).toBe("De B");
  });

  test("escopo RESTRITO: BROKER fora da carteira não edita a Person", async () => {
    const c = await novoCenario("RESTRICTED");
    const outroUsuario = await criarUsuario({ name: "Outro corretor" });
    const outroMembro = await criarMembro({
      organizationId: c.organization.id,
      userId: outroUsuario.id,
      role: "BROKER",
    });
    const p = await criarPessoaFixture({ organizationId: c.organization.id, name: "Da Ana" });
    await prisma.person.update({
      where: { id: p.id, organizationId: c.organization.id },
      data: { responsibleMemberId: c.membro.id },
    });

    autenticarComo(c, { organizationMemberId: outroMembro.id, role: "BROKER" });
    const estado = await atualizarPessoa(p.id, { success: false }, form({ nome: "Roubado" }));
    expect(estado.success).toBe(false);
    expect((await pessoaAtual(p.id, c.organization.id)).name).toBe("Da Ana");
  });

  test("escopo RESTRITO: BROKER responsável pela Person edita normalmente", async () => {
    const c = await novoCenario("RESTRICTED");
    const p = await criarPessoaFixture({ organizationId: c.organization.id, name: "Da Ana" });
    await prisma.person.update({
      where: { id: p.id, organizationId: c.organization.id },
      data: { responsibleMemberId: c.membro.id },
    });

    autenticarComo(c, { role: "BROKER" });
    const estado = await atualizarPessoa(p.id, { success: false }, form({ nome: "Atualizado" }));
    expect(estado.success).toBe(true);
  });
});

describe("atualizarPessoa — concorrência", () => {
  test("dois submits concorrentes para o mesmo e-mail: um vence, o outro recebe erro de domínio (nunca 500)", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const alvo1 = await criarPessoaFixture({ organizationId: c.organization.id });
    const alvo2 = await criarPessoaFixture({ organizationId: c.organization.id });

    const resultados = await Promise.all([
      atualizarPessoa(alvo1.id, { success: false }, form({ nome: "Aa", email: "disputado@email.com" })),
      atualizarPessoa(alvo2.id, { success: false }, form({ nome: "Bb", email: "disputado@email.com" })),
    ]);

    const sucessos = resultados.filter((r) => r.success);
    const falhas = resultados.filter((r) => !r.success);
    expect(sucessos).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect(falhas[0].message).toMatch(/já existe/i);
  });

  test("duas edições concorrentes numa Person com negociação existente não duplicam nada", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id, name: "Original" });
    const imovel = await criarImovel({ organizationId: c.organization.id, purpose: "SALE", price: 100000 });
    const interesse = await prisma.propertyInterest.create({
      data: { organizationId: c.organization.id, personId: p.id, propertyId: imovel.id, stage: "INTERESTED" },
    });

    await Promise.all([
      atualizarPessoa(p.id, { success: false }, form({ nome: "Nome Um" })),
      atualizarPessoa(p.id, { success: false }, form({ nome: "Nome Dois" })),
    ]);

    // Last-write-wins em campo comum é aceitável (Fase 114/115) — o que
    // precisa ser verdade é que continua existindo EXATAMENTE uma Person
    // e EXATAMENTE a mesma PropertyInterest, nunca duplicadas.
    expect(await prisma.person.count({ where: { id: p.id, organizationId: c.organization.id } })).toBe(1);
    expect(
      await prisma.propertyInterest.count({ where: { personId: p.id, organizationId: c.organization.id } })
    ).toBe(1);
    const interesseDepois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse.id, organizationId: c.organization.id },
    });
    expect(interesseDepois.id).toBe(interesse.id);
    expect(interesseDepois.stage).toBe("INTERESTED");
  });
});

describe("atualizarPessoa — dedup público depois da edição", () => {
  test("formulário público com o e-mail NOVO reutiliza a mesma Person, não cria outra", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id, email: "antigo@email.com" });

    await atualizarPessoa(p.id, { success: false }, form({ nome: "Xx", email: "novo@email.com" }));

    const { resolverPessoaParaFormularioPublico } = await import("@/lib/person-dedup");
    const resultado = await resolverPessoaParaFormularioPublico({
      organizationId: c.organization.id,
      nome: "Quem Preencheu o Site",
      email: "novo@email.com",
      telefone: null,
      role: "LEAD",
    });
    expect(resultado).toEqual({ tipo: "reutilizada", personId: p.id });
  });

  test("formulário público com o e-mail ANTIGO (liberado) cria uma Person nova, não 'lembra' da antiga", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id, email: "sera-liberado@email.com" });

    await atualizarPessoa(p.id, { success: false }, form({ nome: "Xx", email: "email-atual@email.com" }));

    const { resolverPessoaParaFormularioPublico } = await import("@/lib/person-dedup");
    const resultado = await resolverPessoaParaFormularioPublico({
      organizationId: c.organization.id,
      nome: "Outra Pessoa Qualquer",
      email: "sera-liberado@email.com",
      telefone: null,
      role: "LEAD",
    });
    expect(resultado.tipo).toBe("criada");
    if (resultado.tipo === "criada") expect(resultado.personId).not.toBe(p.id);
  });
});

describe("atualizarPessoa — edições sucessivas e legado", () => {
  test("A → B → C: ID estável, cada identificador anterior é liberado, relações intactas", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const p = await criarPessoaFixture({ organizationId: c.organization.id, email: "a@email.com", phone: "11911111111" });
    const imovel = await criarImovel({ organizationId: c.organization.id, purpose: "SALE", price: 100000 });
    const interesse = await prisma.propertyInterest.create({
      data: { organizationId: c.organization.id, personId: p.id, propertyId: imovel.id, stage: "INTERESTED" },
    });

    await atualizarPessoa(
      p.id,
      { success: false },
      form({ nome: "João Silva", email: "b@email.com", telefone: "(11) 92222-2222" })
    );
    await atualizarPessoa(
      p.id,
      { success: false },
      form({ nome: "João Souza", email: "c@email.com", telefone: "(11) 93333-3333" })
    );

    const atual = await prisma.person.findUniqueOrThrow({
      where: { id: p.id, organizationId: c.organization.id },
    });
    expect(atual.id).toBe(p.id);
    expect(atual.name).toBe("João Souza");
    expect(atual.emailNormalized).toBe("c@email.com");
    expect(atual.phoneNormalized).toBe("11933333333");

    // a@email.com e b@email.com (e os telefones intermediários) estão
    // livres — nenhum deles permanece preso à Person por engano.
    const outraA = await prisma.person.create({
      data: {
        organizationId: c.organization.id,
        name: "Reusa A",
        email: "a@email.com",
        emailNormalized: "a@email.com",
        roles: ["LEAD"],
      },
    });
    const outraB = await prisma.person.create({
      data: {
        organizationId: c.organization.id,
        name: "Reusa B",
        email: "b@email.com",
        emailNormalized: "b@email.com",
        roles: ["LEAD"],
      },
    });
    expect(outraA.id).toBeTruthy();
    expect(outraB.id).toBeTruthy();

    const interesseDepois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse.id, organizationId: c.organization.id },
    });
    expect(interesseDepois.personId).toBe(p.id);
  });

  test("Person legada (emailNormalized null, duplicata histórica) edita sem backfill/merge", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    // Simula o estado legado documentado na Fase 95: email preenchido mas
    // emailNormalized null (duplicata histórica preservada, fora da
    // deduplicação automática).
    const legado = await prisma.person.create({
      data: {
        organizationId: c.organization.id,
        name: "Legado",
        email: "legado@email.com",
        emailNormalized: null,
        roles: ["LEAD"],
      },
    });

    const estado = await atualizarPessoa(
      legado.id,
      { success: false },
      form({ nome: "Legado Corrigido", email: "legado-corrigido@email.com" })
    );
    expect(estado.success).toBe(true);

    const atual = await prisma.person.findUniqueOrThrow({
      where: { id: legado.id, organizationId: c.organization.id },
    });
    // A PRÓPRIA edição normaliza o estado atual desta linha — sem tocar
    // em nenhuma outra Person da organização.
    expect(atual.emailNormalized).toBe("legado-corrigido@email.com");
    expect(
      await prisma.person.count({ where: { organizationId: c.organization.id } })
    ).toBe(1);
  });
});

import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa } from "@/test/fixtures";
import { resolverPessoaParaFormularioPublico } from "@/lib/person-dedup";

// resolverPessoaParaFormularioPublico (src/lib/person-dedup.ts) não
// importa @/lib/auth nem next/headers/next/cache — testável direto, sem
// nenhum mock de runtime do Next (diferente de registrar-interacao.test.ts
// e enviar-contato-dedup.test.ts, que precisam mockar por importarem
// @/lib/tenant/@/lib/auth transitivamente).
describe("resolverPessoaParaFormularioPublico — deduplicação de leads", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;
  let cenarioB: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  test("A) mesmo e-mail normalizado (caixa diferente) reutiliza a Person", async () => {
    cenario = await criarCenario();
    const primeira = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "João Silva",
      email: "joao@email.com",
      telefone: null,
      role: "LEAD",
      source: "WEBSITE",
    });
    expect(primeira.tipo).toBe("criada");

    const segunda = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "João Silva",
      email: "JOAO@EMAIL.COM",
      telefone: null,
      role: "LEAD",
      source: "WEBSITE",
    });
    expect(segunda.tipo).toBe("reutilizada");
    expect((segunda as { personId: string }).personId).toBe(
      (primeira as { personId: string }).personId
    );

    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
  });

  test("B) mesmo telefone normalizado (formato diferente) reutiliza a Person", async () => {
    cenario = await criarCenario();
    const primeira = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Maria",
      email: null,
      telefone: "11999999999",
      role: "LEAD",
      source: "WEBSITE",
    });
    const segunda = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Maria",
      email: null,
      telefone: "(11) 99999-9999",
      role: "LEAD",
      source: "WEBSITE",
    });
    expect(segunda.tipo).toBe("reutilizada");
    expect((segunda as { personId: string }).personId).toBe(
      (primeira as { personId: string }).personId
    );

    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
  });

  test("C) e-mail e telefone iguais na segunda submissão reutiliza a Person", async () => {
    cenario = await criarCenario();
    const primeira = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Carlos",
      email: "carlos@email.com",
      telefone: "11988887777",
      role: "LEAD",
      source: "WEBSITE",
    });
    const segunda = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Carlos",
      email: "carlos@email.com",
      telefone: "(11) 98888-7777",
      role: "LEAD",
      source: "WEBSITE",
    });
    expect(segunda.tipo).toBe("reutilizada");
    expect((segunda as { personId: string }).personId).toBe(
      (primeira as { personId: string }).personId
    );

    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
  });

  test("D) mesmo e-mail/telefone em organizações diferentes cria Persons independentes", async () => {
    cenario = await criarCenario();
    cenarioB = await criarCenario();

    const emA = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Ana",
      email: "ana@email.com",
      telefone: "11977776666",
      role: "LEAD",
      source: "WEBSITE",
    });
    const emB = await resolverPessoaParaFormularioPublico({
      organizationId: cenarioB.organization.id,
      nome: "Ana",
      email: "ana@email.com",
      telefone: "11977776666",
      role: "LEAD",
      source: "WEBSITE",
    });

    expect(emA.tipo).toBe("criada");
    expect(emB.tipo).toBe("criada");
    expect((emA as { personId: string }).personId).not.toBe(
      (emB as { personId: string }).personId
    );
  });

  test("Conflito (e-mail→A, telefone→B): não mescla, não escolhe, não cria Person nova, não altera A nem B", async () => {
    cenario = await criarCenario();
    const orgId = cenario.organization.id;

    const pessoaA = await resolverPessoaParaFormularioPublico({
      organizationId: orgId,
      nome: "Pessoa A",
      email: "a@email.com",
      telefone: null,
      role: "LEAD",
      source: "WEBSITE",
    });
    const pessoaB = await resolverPessoaParaFormularioPublico({
      organizationId: orgId,
      nome: "Pessoa B",
      email: null,
      telefone: "11911112222",
      role: "LEAD",
      source: "WEBSITE",
    });
    expect(pessoaA.tipo).toBe("criada");
    expect(pessoaB.tipo).toBe("criada");

    const idA = (pessoaA as { personId: string }).personId;
    const idB = (pessoaB as { personId: string }).personId;
    const snapshotAntesA = await prisma.person.findUniqueOrThrow({ where: { id: idA, organizationId: orgId } });
    const snapshotAntesB = await prisma.person.findUniqueOrThrow({ where: { id: idB, organizationId: orgId } });

    const resultado = await resolverPessoaParaFormularioPublico({
      organizationId: orgId,
      nome: "Pessoa Conflitante",
      email: "a@email.com", // bate com A
      telefone: "11911112222", // bate com B
      role: "LEAD",
      source: "WEBSITE",
    });
    expect(resultado.tipo).toBe("conflito");

    // Nenhuma Person nova — total continua exatamente 2 (A e B).
    const total = await prisma.person.count({ where: { organizationId: orgId } });
    expect(total).toBe(2);

    // A e B continuam byte-a-byte iguais a antes.
    const depoisA = await prisma.person.findUniqueOrThrow({ where: { id: idA, organizationId: orgId } });
    const depoisB = await prisma.person.findUniqueOrThrow({ where: { id: idB, organizationId: orgId } });
    expect(depoisA).toEqual(snapshotAntesA);
    expect(depoisB).toEqual(snapshotAntesB);
  });

  test("G) duas submissões simultâneas com mesmo e-mail resultam numa única Person", async () => {
    cenario = await criarCenario();
    const [r1, r2] = await Promise.all([
      resolverPessoaParaFormularioPublico({
        organizationId: cenario.organization.id,
        nome: "Concorrente 1",
        email: "corrida@email.com",
        telefone: null,
        role: "LEAD",
        source: "WEBSITE",
      }),
      resolverPessoaParaFormularioPublico({
        organizationId: cenario.organization.id,
        nome: "Concorrente 2",
        email: "corrida@email.com",
        telefone: null,
        role: "LEAD",
        source: "WEBSITE",
      }),
    ]);
    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
    expect((r1 as { personId: string }).personId).toBe((r2 as { personId: string }).personId);
  });

  test("H) duas submissões simultâneas com mesmo telefone resultam numa única Person", async () => {
    cenario = await criarCenario();
    const [r1, r2] = await Promise.all([
      resolverPessoaParaFormularioPublico({
        organizationId: cenario.organization.id,
        nome: "Concorrente 1",
        email: null,
        telefone: "11955554444",
        role: "LEAD",
        source: "WEBSITE",
      }),
      resolverPessoaParaFormularioPublico({
        organizationId: cenario.organization.id,
        nome: "Concorrente 2",
        email: null,
        telefone: "11955554444",
        role: "LEAD",
        source: "WEBSITE",
      }),
    ]);
    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
    expect((r1 as { personId: string }).personId).toBe((r2 as { personId: string }).personId);
  });

  test("I) duas submissões simultâneas com e-mail e telefone iguais resultam numa única Person", async () => {
    cenario = await criarCenario();
    const dados = {
      organizationId: cenario.organization.id,
      nome: "Concorrente",
      email: "ambos@email.com",
      telefone: "11933332222",
      role: "LEAD" as const,
      source: "WEBSITE" as const,
    };
    const [r1, r2] = await Promise.all([
      resolverPessoaParaFormularioPublico(dados),
      resolverPessoaParaFormularioPublico(dados),
    ]);
    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
    expect((r1 as { personId: string }).personId).toBe((r2 as { personId: string }).personId);
  });

  test("J) Person CLIENT que recebe novo contato preserva CLIENT e ganha LEAD uma única vez", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({
      organizationId: cenario.organization.id,
      email: "cliente@email.com",
      roles: ["CLIENT"],
    });

    await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Cliente Existente",
      email: "cliente@email.com",
      telefone: null,
      role: "LEAD",
      source: "WEBSITE",
    });
    // Segunda vez, mesmo e-mail — não deve duplicar a entrada "LEAD".
    await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Cliente Existente",
      email: "cliente@email.com",
      telefone: null,
      role: "LEAD",
      source: "WEBSITE",
    });

    const atualizado = await prisma.person.findUniqueOrThrow({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(atualizado.roles).toEqual(["CLIENT", "LEAD"]);
  });

  test("K) Person existente recebe 'Anuncie seu imóvel' — OWNER adicionado sem remover roles existentes", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({
      organizationId: cenario.organization.id,
      email: "proprietario@email.com",
      roles: ["CLIENT"],
    });

    await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Proprietário",
      email: "proprietario@email.com",
      telefone: null,
      role: "OWNER",
      source: "WEBSITE",
    });

    const atualizado = await prisma.person.findUniqueOrThrow({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(atualizado.roles).toEqual(["CLIENT", "OWNER"]);
  });

  test("L) reutilização não sobrescreve assignedMemberId, pipelineStage, source ou notes", async () => {
    cenario = await criarCenario();
    const pessoa = await prisma.person.create({
      data: {
        organizationId: cenario.organization.id,
        name: "Pessoa Antiga",
        email: "antiga@email.com",
        emailNormalized: "antiga@email.com",
        roles: ["LEAD"],
        source: "REFERRAL",
        notes: "Nota original importante",
        pipelineStage: "PROPOSAL",
        assignedMemberId: cenario.membro.id,
      },
    });

    const resultado = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Pessoa Antiga",
      email: "antiga@email.com",
      telefone: null,
      role: "LEAD",
      source: "WEBSITE",
    });
    expect(resultado.tipo).toBe("reutilizada");

    const atualizado = await prisma.person.findUniqueOrThrow({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(atualizado.source).toBe("REFERRAL");
    expect(atualizado.notes).toBe("Nota original importante");
    expect(atualizado.pipelineStage).toBe("PROPOSAL");
    expect(atualizado.assignedMemberId).toBe(cenario.membro.id);
    expect(atualizado.email).toBe("antiga@email.com");
  });
});

describe("Normalização vazia nunca vira identidade compartilhada", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("Person sem e-mail nem telefone continua podendo ser criada, sem violar as unique constraints", async () => {
    cenario = await criarCenario();
    const r1 = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Sem contato 1",
      email: null,
      telefone: null,
      role: "LEAD",
      source: "WEBSITE",
    });
    const r2 = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Sem contato 2",
      email: null,
      telefone: null,
      role: "LEAD",
      source: "WEBSITE",
    });

    expect(r1.tipo).toBe("criada");
    expect(r2.tipo).toBe("criada");
    expect((r1 as { personId: string }).personId).not.toBe(
      (r2 as { personId: string }).personId
    );

    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(2);
  });

  test("e-mail só com espaços e telefone sem dígitos normalizam pra NULL — várias Persons assim coexistem", async () => {
    cenario = await criarCenario();
    const r1 = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Contato sujo 1",
      email: "   ",
      telefone: "abc",
      role: "LEAD",
      source: "WEBSITE",
    });
    const r2 = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Contato sujo 2",
      email: "   ",
      telefone: "abc",
      role: "LEAD",
      source: "WEBSITE",
    });

    // "" nunca é gravado como identidade — cada submissão cria uma Person
    // própria em vez de colidir na unique constraint (que só rejeita
    // valores NÃO-nulos repetidos).
    expect(r1.tipo).toBe("criada");
    expect(r2.tipo).toBe("criada");

    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(2);

    const pessoa1 = await prisma.person.findUniqueOrThrow({
      where: { id: (r1 as { personId: string }).personId, organizationId: cenario.organization.id },
    });
    expect(pessoa1.emailNormalized).toBeNull();
    expect(pessoa1.phoneNormalized).toBeNull();
  });

  test("valor válido continua normalizando e deduplicando normalmente", async () => {
    cenario = await criarCenario();
    const r1 = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Contato válido",
      email: "valido@email.com",
      telefone: "11922223333",
      role: "LEAD",
      source: "WEBSITE",
    });
    const r2 = await resolverPessoaParaFormularioPublico({
      organizationId: cenario.organization.id,
      nome: "Contato válido de novo",
      email: "VALIDO@EMAIL.COM",
      telefone: "(11) 92222-3333",
      role: "LEAD",
      source: "WEBSITE",
    });
    expect(r1.tipo).toBe("criada");
    expect(r2.tipo).toBe("reutilizada");
    expect((r2 as { personId: string }).personId).toBe((r1 as { personId: string }).personId);
  });
});

describe("Backfill de emailNormalized/phoneNormalized — comportamento com duplicata histórica", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  // Reproduz exatamente a lógica condicional da migration
  // 20260811194701_add_person_normalized_contact contra dados fabricados
  // pra simular estado pré-backfill (emailNormalized ainda null) — prova
  // que duplicata histórica não quebra a constraint nem perde dado.
  async function rodarBackfillEmail() {
    await prisma.$executeRawUnsafe(`
      WITH duplicados_email AS (
        SELECT "organizationId", lower(trim("email")) AS norm
        FROM "people"
        WHERE "email" IS NOT NULL
        GROUP BY "organizationId", lower(trim("email"))
        HAVING count(*) > 1
      )
      UPDATE "people" p
      SET "emailNormalized" = lower(trim(p."email"))
      WHERE p."email" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM duplicados_email d
          WHERE d."organizationId" = p."organizationId" AND d.norm = lower(trim(p."email"))
        );
    `);
  }

  test("F) duplicata histórica de e-mail fica com emailNormalized NULL, sem perder dado", async () => {
    cenario = await criarCenario();
    const orgId = cenario.organization.id;

    const dup1 = await prisma.person.create({
      data: { organizationId: orgId, name: "Duplicata 1", email: "duplicado@email.com", roles: ["LEAD"] },
    });
    const dup2 = await prisma.person.create({
      data: { organizationId: orgId, name: "Duplicata 2", email: "DUPLICADO@EMAIL.COM", roles: ["LEAD"] },
    });
    const unica = await prisma.person.create({
      data: { organizationId: orgId, name: "Única", email: "unica@email.com", roles: ["LEAD"] },
    });

    await rodarBackfillEmail();

    const [pos1, pos2, posUnica] = await Promise.all([
      prisma.person.findUniqueOrThrow({ where: { id: dup1.id, organizationId: orgId } }),
      prisma.person.findUniqueOrThrow({ where: { id: dup2.id, organizationId: orgId } }),
      prisma.person.findUniqueOrThrow({ where: { id: unica.id, organizationId: orgId } }),
    ]);

    // Duplicatas: emailNormalized fica NULL, e-mail original intacto.
    expect(pos1.emailNormalized).toBeNull();
    expect(pos2.emailNormalized).toBeNull();
    expect(pos1.email).toBe("duplicado@email.com");
    expect(pos2.email).toBe("DUPLICADO@EMAIL.COM");

    // Valor único: populado normalmente.
    expect(posUnica.emailNormalized).toBe("unica@email.com");

    // Nenhuma linha foi perdida.
    const total = await prisma.person.count({ where: { organizationId: orgId } });
    expect(total).toBe(3);
  });
});

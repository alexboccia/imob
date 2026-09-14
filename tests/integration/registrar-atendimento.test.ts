import { describe, test, expect, afterEach, vi } from "vitest";

// Mesmas limitações já documentadas nos outros testes desta árvore: as
// actions importam @/lib/auth -> next-auth -> next/server, que não
// resolve sob Vitest puro. auth() é mockado e devolve uma sessão real.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import { auth } from "@/lib/auth";
import { registrarAtendimentoDoContato } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { buscarNovosContatos } from "@/lib/novos-contatos";
import { buscarCentralTrabalho } from "@/lib/central-trabalho";

// =======================================================================
// Registrar atendimento a partir de um contato
// =======================================================================
// O card não some porque alguém clicou em "resolvido": ele some porque
// passou a existir um atendimento POSTERIOR ao contato. Estes testes
// provam as duas metades — que o fato é criado corretamente, e que a
// fila responde a ele.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

const cenarios: Cenario[] = [];
afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

function autenticarComo(cenario: Cenario, sobrescrever: Record<string, unknown> = {}) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
      ...sobrescrever,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function formulario(tipo: string, notas?: string): FormData {
  const fd = new FormData();
  fd.set("tipo", tipo);
  if (notas !== undefined) fd.set("notas", notas);
  return fd;
}

// Formulário COM a próxima ação marcada. O instante viaja como
// datetime-local (hora de parede da organização), igual às telas de
// agenda — nenhuma convenção nova.
function formularioComProximo(opcoes: {
  tipo?: string;
  assunto?: string;
  quando?: Date;
}): FormData {
  const fd = formulario(opcoes.tipo ?? "CALL", "Conversei com o cliente.");
  fd.set("agendarProximo", "on");
  fd.set("proximoAssunto", opcoes.assunto ?? "Ligar para confirmar a visita");
  const quando = opcoes.quando ?? new Date(Date.now() + 48 * 3600_000);
  const dois = (n: number) => String(n).padStart(2, "0");
  fd.set(
    "proximoQuando",
    `${quando.getUTCFullYear()}-${dois(quando.getUTCMonth() + 1)}-${dois(quando.getUTCDate())}T${dois(quando.getUTCHours())}:${dois(quando.getUTCMinutes())}`
  );
  return fd;
}

async function contatoDoSite(opcoes: {
  organizationId: string;
  personId: string;
  propertyId?: string | null;
  occurredAt?: Date;
}) {
  return prisma.interaction.create({
    data: {
      organizationId: opcoes.organizationId,
      personId: opcoes.personId,
      propertyId: opcoes.propertyId ?? null,
      type: "MESSAGE",
      notes: "Tenho interesse.",
      origin: "IMOVEL",
      memberId: null,
      occurredAt: opcoes.occurredAt ?? new Date(),
    },
    select: { id: true },
  });
}

const TODA_A_ORGANIZACAO = { tipo: "ORGANIZACAO" } as const;

describe("registrarAtendimentoDoContato", () => {
  test("cria o atendimento com autor, pessoa e o imóvel do contato original", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const contato = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
    });

    const estado = await registrarAtendimentoDoContato(
      contato.id,
      ESTADO_INICIAL_ACAO,
      formulario("CALL", "Cliente quer visitar sábado de manhã.")
    );
    expect(estado.success).toBe(true);

    const registrado = await prisma.interaction.findFirst({
      where: { organizationId: cenario.organization.id, memberId: { not: null } },
    });
    expect(registrado?.type).toBe("CALL");
    expect(registrado?.notes).toBe("Cliente quer visitar sábado de manhã.");
    expect(registrado?.personId).toBe(pessoa.id);
    // O imóvel do contato é preservado: o corretor não reinforma o que o
    // sistema já sabe.
    expect(registrado?.propertyId).toBe(imovel.id);
    expect(registrado?.memberId).toBe(cenario.membro.id);
    // Atendimento registrado à mão não é captação: sem origem de site.
    expect(registrado?.origin).toBeNull();
  });

  test("o contato sai da fila, e o contato SEGUINTE da mesma pessoa a traz de volta", async () => {
    // T0 chega -> T1 atende -> T2 chega de novo -> T3 atende.
    // É o que prova que modelamos EVENTOS, não um status da pessoa.
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const primeiro = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      occurredAt: new Date(Date.now() - 3 * 3600_000),
    });
    expect((await buscarNovosContatos(cenario.organization.id, TODA_A_ORGANIZACAO)).total).toBe(1);

    expect(
      (await registrarAtendimentoDoContato(primeiro.id, ESTADO_INICIAL_ACAO, formulario("CALL")))
        .success
    ).toBe(true);
    expect((await buscarNovosContatos(cenario.organization.id, TODA_A_ORGANIZACAO)).total).toBe(0);

    // A action grava o atendimento com occurredAt = agora (default do
    // banco), e o teste não controla isso. Para simular uma LINHA DO
    // TEMPO, o atendimento recém-gravado é recuado na fixture — assim o
    // segundo contato pode ser posterior a ele e ainda anterior ao
    // atendimento final. Nada de sleep e nada de data no futuro, que
    // seria um contato que ainda não aconteceu.
    await prisma.interaction.updateMany({
      where: { organizationId: cenario.organization.id, memberId: { not: null } },
      data: { occurredAt: new Date(Date.now() - 2 * 3600_000) },
    });

    const segundo = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      occurredAt: new Date(Date.now() - 3600_000),
    });
    expect((await buscarNovosContatos(cenario.organization.id, TODA_A_ORGANIZACAO)).total).toBe(1);

    expect(
      (await registrarAtendimentoDoContato(segundo.id, ESTADO_INICIAL_ACAO, formulario("MESSAGE")))
        .success
    ).toBe(true);
    expect((await buscarNovosContatos(cenario.organization.id, TODA_A_ORGANIZACAO)).total).toBe(0);
  });

  test("dois registros seguidos são legítimos e não corrompem nada", async () => {
    // Concorrência real do produto: dois gestores com a Central aberta.
    // O domínio aceita duas Interactions; a fila continua zerada.
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const contato = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
    });

    await registrarAtendimentoDoContato(contato.id, ESTADO_INICIAL_ACAO, formulario("CALL"));
    await registrarAtendimentoDoContato(contato.id, ESTADO_INICIAL_ACAO, formulario("EMAIL"));

    const registrados = await prisma.interaction.count({
      where: { organizationId: cenario.organization.id, memberId: { not: null } },
    });
    expect(registrados).toBe(2);
    expect((await buscarNovosContatos(cenario.organization.id, TODA_A_ORGANIZACAO)).total).toBe(0);
  });

  test("tipo inválido é recusado, sem gravar nada", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const contato = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
    });

    const estado = await registrarAtendimentoDoContato(
      contato.id,
      ESTADO_INICIAL_ACAO,
      formulario("TELEPATIA")
    );
    expect(estado.success).toBe(false);
    expect(estado.fieldErrors?.tipo).toBeTruthy();
    expect(
      await prisma.interaction.count({
        where: { organizationId: cenario.organization.id, memberId: { not: null } },
      })
    ).toBe(0);
  });

  test("IDOR: contato de outra organização não pode ser atendido", async () => {
    const meu = await novoCenario();
    const alheio = await novoCenario();
    const pessoaAlheia = await criarPessoa({ organizationId: alheio.organization.id });
    const contatoAlheio = await contatoDoSite({
      organizationId: alheio.organization.id,
      personId: pessoaAlheia.id,
    });

    // Sessão da MINHA organização mandando o id do contato da outra.
    autenticarComo(meu);
    const estado = await registrarAtendimentoDoContato(
      contatoAlheio.id,
      ESTADO_INICIAL_ACAO,
      formulario("CALL")
    );

    expect(estado.success).toBe(false);
    // Nada foi criado em nenhum dos dois lados.
    expect(
      await prisma.interaction.count({
        where: { organizationId: alheio.organization.id, memberId: { not: null } },
      })
    ).toBe(0);
    expect(
      await prisma.interaction.count({
        where: { organizationId: meu.organization.id, memberId: { not: null } },
      })
    ).toBe(0);
  });

  test("memberId injetado de OUTRO tenant nunca vira autoria", async () => {
    const meu = await novoCenario();
    const alheio = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: meu.organization.id });
    const contato = await contatoDoSite({
      organizationId: meu.organization.id,
      personId: pessoa.id,
    });

    // Sessão adulterada: membro de outra organização.
    autenticarComo(meu, { organizationMemberId: alheio.membro.id });
    const estado = await registrarAtendimentoDoContato(
      contato.id,
      ESTADO_INICIAL_ACAO,
      formulario("CALL")
    );
    expect(estado.success).toBe(true);

    const registrado = await prisma.interaction.findFirst({
      where: { organizationId: meu.organization.id, type: "CALL" },
    });
    // O fato comercial é preservado; a autoria falsa NÃO.
    expect(registrado).not.toBeNull();
    expect(registrado?.memberId).toBeNull();
  });

  test("escopo restrito: sem vínculo comercial, o contato não é atendível", async () => {
    const cenario = await novoCenario();
    // Organização RESTRITA e sessão de BROKER sem nenhuma negociação.
    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { commercialVisibility: "RESTRICTED" },
    });
    autenticarComo(cenario, { role: "BROKER" });

    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const contato = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
    });

    const estado = await registrarAtendimentoDoContato(
      contato.id,
      ESTADO_INICIAL_ACAO,
      formulario("CALL")
    );
    expect(estado.success).toBe(false);
    expect(
      await prisma.interaction.count({
        where: { organizationId: cenario.organization.id, memberId: { not: null } },
      })
    ).toBe(0);
  });

  test("observação é opcional e espaço em branco não vira texto", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const contato = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
    });

    expect(
      (await registrarAtendimentoDoContato(contato.id, ESTADO_INICIAL_ACAO, formulario("OTHER", "   ")))
        .success
    ).toBe(true);
    const registrado = await prisma.interaction.findFirst({
      where: { organizationId: cenario.organization.id, memberId: { not: null } },
    });
    expect(registrado?.notes).toBeNull();
  });
});

describe("derivação da fila — bordas de tempo", () => {
  test("atendimento no MESMO instante do contato conta como atendido", async () => {
    // Borda real: a comparação é estrita (contato > trabalho), então um
    // empate resolve a favor de "já foi trabalhado" — o que evita um
    // card ressurgindo por um microssegundo de diferença.
    const cenario = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const instante = new Date();

    await prisma.interaction.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        type: "MESSAGE",
        origin: "IMOVEL",
        memberId: null,
        occurredAt: instante,
      },
    });
    await prisma.interaction.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        type: "CALL",
        memberId: cenario.membro.id,
        occurredAt: instante,
      },
    });

    expect((await buscarNovosContatos(cenario.organization.id, TODA_A_ORGANIZACAO)).total).toBe(0);
  });
});

// =======================================================================
// Atendimento + próxima ação, na mesma submissão
// =======================================================================
// Dois FATOS diferentes, uma intenção do usuário. O domínio continua
// expressando os dois separadamente — o que muda é que eles podem nascer
// juntos, e atomicamente.
describe("registrarAtendimentoDoContato — com próxima ação", () => {
  test("sem marcar: cria só a Interaction, nenhum compromisso", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const contato = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
    });

    expect(
      (await registrarAtendimentoDoContato(contato.id, ESTADO_INICIAL_ACAO, formulario("CALL")))
        .success
    ).toBe(true);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: cenario.organization.id } })
    ).toBe(0);
  });

  test("marcando: cria os dois, com posse e autoria corretas, sem negociação", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const contato = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
    });

    const estado = await registrarAtendimentoDoContato(
      contato.id,
      ESTADO_INICIAL_ACAO,
      formularioComProximo({ assunto: "Ligar para confirmar a visita" })
    );
    expect(estado.success).toBe(true);

    const atendimento = await prisma.interaction.findFirst({
      where: { organizationId: cenario.organization.id, memberId: { not: null } },
    });
    expect(atendimento).not.toBeNull();

    const compromisso = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id },
    });
    expect(compromisso.type).toBe("FOLLOW_UP");
    expect(compromisso.subject).toBe("Ligar para confirmar a visita");
    expect(compromisso.status).toBe("SCHEDULED");
    expect(compromisso.personId).toBe(pessoa.id);
    // O imóvel do contato viaja junto: "próximo contato com Maria SOBRE
    // o apartamento X".
    expect(compromisso.propertyId).toBe(imovel.id);
    // Sem negociação, de propósito — o compromisso nasce do atendimento.
    expect(compromisso.propertyInterestId).toBeNull();
    // POSSE e AUTORIA são o mesmo membro neste caso de uso, e continuam
    // sendo colunas diferentes.
    expect(compromisso.responsibleMemberId).toBe(cenario.membro.id);
    expect(compromisso.createdByMemberId).toBe(cenario.membro.id);
  });

  test("o compromisso aparece na Central do responsável", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const contato = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
    });

    await registrarAtendimentoDoContato(
      contato.id,
      ESTADO_INICIAL_ACAO,
      formularioComProximo({})
    );

    const central = await buscarCentralTrabalho(
      cenario.organization.id,
      cenario.membro.id,
      "UTC"
    );
    const todos = [...central.atrasadas.itens, ...central.hoje.itens, ...central.proximas];
    expect(todos.map((c) => c.tipo)).toContain("FOLLOW_UP");
  });

  test("o contato sai da fila pelo ATENDIMENTO, nunca pelo compromisso", async () => {
    // O compromisso é próxima ação, não prova de atendimento. A fila
    // continua olhando só para Interaction/negociação.
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const contato = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      occurredAt: new Date(Date.now() - 3600_000),
    });

    await registrarAtendimentoDoContato(contato.id, ESTADO_INICIAL_ACAO, formularioComProximo({}));
    expect((await buscarNovosContatos(cenario.organization.id, TODA_A_ORGANIZACAO)).total).toBe(0);
  });

  test("data no passado: nada é criado — nem o atendimento", async () => {
    // ATOMICIDADE na prática: a validação acontece antes de qualquer
    // escrita, então não existe o estado intermediário "contato saiu da
    // fila mas o compromisso que ele pediu não existe".
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const contato = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
    });

    const estado = await registrarAtendimentoDoContato(
      contato.id,
      ESTADO_INICIAL_ACAO,
      formularioComProximo({ quando: new Date(Date.now() - 3600_000) })
    );
    expect(estado.success).toBe(false);
    expect(estado.fieldErrors?.proximoQuando).toBeTruthy();
    expect(
      await prisma.interaction.count({
        where: { organizationId: cenario.organization.id, memberId: { not: null } },
      })
    ).toBe(0);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: cenario.organization.id } })
    ).toBe(0);
  });

  test("assunto vazio: recusado, e nada é criado", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const contato = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
    });

    const estado = await registrarAtendimentoDoContato(
      contato.id,
      ESTADO_INICIAL_ACAO,
      formularioComProximo({ assunto: "   " })
    );
    expect(estado.success).toBe(false);
    expect(estado.fieldErrors?.proximoAssunto).toBeTruthy();
    expect(
      await prisma.interaction.count({
        where: { organizationId: cenario.organization.id, memberId: { not: null } },
      })
    ).toBe(0);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: cenario.organization.id } })
    ).toBe(0);
  });

  test("membro de outro tenant na sessão: recusa e não cria compromisso órfão", async () => {
    const meu = await novoCenario();
    const alheio = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: meu.organization.id });
    const contato = await contatoDoSite({
      organizationId: meu.organization.id,
      personId: pessoa.id,
    });

    autenticarComo(meu, { organizationMemberId: alheio.membro.id });
    const estado = await registrarAtendimentoDoContato(
      contato.id,
      ESTADO_INICIAL_ACAO,
      formularioComProximo({})
    );

    // Sem vínculo válido não há a quem atribuir o compromisso — e um
    // compromisso órfão seria invisível justamente para quem o pediu.
    expect(estado.success).toBe(false);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: meu.organization.id } })
    ).toBe(0);
    expect(
      await prisma.interaction.count({
        where: { organizationId: meu.organization.id, memberId: { not: null } },
      })
    ).toBe(0);
  });

  test("novo contato depois do follow-up volta para a fila", async () => {
    // Compromisso futuro agendado não pode mascarar uma manifestação
    // NOVA de interesse.
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const primeiro = await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      occurredAt: new Date(Date.now() - 4 * 3600_000),
    });
    await registrarAtendimentoDoContato(primeiro.id, ESTADO_INICIAL_ACAO, formularioComProximo({}));
    expect((await buscarNovosContatos(cenario.organization.id, TODA_A_ORGANIZACAO)).total).toBe(0);

    await prisma.interaction.updateMany({
      where: { organizationId: cenario.organization.id, memberId: { not: null } },
      data: { occurredAt: new Date(Date.now() - 2 * 3600_000) },
    });
    await contatoDoSite({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      occurredAt: new Date(Date.now() - 3600_000),
    });

    expect((await buscarNovosContatos(cenario.organization.id, TODA_A_ORGANIZACAO)).total).toBe(1);
  });
});

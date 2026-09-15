import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarImovel, criarPessoa, criarUsuario, criarMembro } from "@/test/fixtures";
import { buscarNovosContatos } from "@/lib/novos-contatos";

// =======================================================================
// A caixa de entrada comercial é DERIVADA — estes testes são a prova
// =======================================================================
// Não há coluna de estado. "Aguardando atendimento" sai da comparação
// entre o instante do contato e o instante do último fato de trabalho da
// pessoa. Se essa derivação estiver errada, o corretor trabalha um lead
// duas vezes ou não trabalha nenhuma — por isso ela é testada contra o
// banco de verdade, e não por unidade sobre um mock.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

const ONTEM = new Date(Date.now() - 24 * 3600_000);
const ANTEONTEM = new Date(Date.now() - 48 * 3600_000);
const AGORA = new Date();

describe("buscarNovosContatos", () => {
  let cenarioA: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  const TODA_A_ORGANIZACAO = { tipo: "ORGANIZACAO" } as const;

  async function contatoDoSite(opcoes: {
    organizationId: string;
    personId: string;
    propertyId?: string;
    origin?: string;
    occurredAt?: Date;
    notes?: string;
  }) {
    return prisma.interaction.create({
      data: {
        organizationId: opcoes.organizationId,
        personId: opcoes.personId,
        propertyId: opcoes.propertyId ?? null,
        type: "MESSAGE",
        notes: opcoes.notes ?? "Gostaria de agendar uma visita.",
        origin: opcoes.origin ?? "IMOVEL",
        // A marca estrutural do contato que CHEGOU: ninguém é autor.
        memberId: null,
        occurredAt: opcoes.occurredAt ?? AGORA,
      },
      select: { id: true },
    });
  }

  test("contato do site aguardando aparece, com o contexto comercial", async () => {
    cenarioA = await criarCenario();
    const imovel = await criarImovel({
      organizationId: cenarioA.organization.id,
      title: "Apartamento Vila Mariana",
      responsibleMemberId: cenarioA.membro.id,
      price: 750000,
    });
    const pessoa = await criarPessoa({
      organizationId: cenarioA.organization.id,
      name: "Maria Silva",
      phone: "11988887777",
    });
    await contatoDoSite({
      organizationId: cenarioA.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
    });

    const { itens, total } = await buscarNovosContatos(
      cenarioA.organization.id,
      TODA_A_ORGANIZACAO
    );

    expect(total).toBe(1);
    expect(itens[0].pessoa.nome).toBe("Maria Silva");
    expect(itens[0].pessoa.telefone).toBe("11988887777");
    expect(itens[0].imovel?.titulo).toBe("Apartamento Vila Mariana");
    expect(itens[0].imovel?.preco).toBe("750000");
    expect(itens[0].origem).toBe("IMOVEL");
    expect(itens[0].mensagem).toContain("agendar uma visita");
  });

  test("registrar atendimento DEPOIS do contato tira ele da fila", async () => {
    cenarioA = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });
    await contatoDoSite({
      organizationId: cenarioA.organization.id,
      personId: pessoa.id,
      occurredAt: ONTEM,
    });

    expect((await buscarNovosContatos(cenarioA.organization.id, TODA_A_ORGANIZACAO)).total).toBe(1);

    // Interação COM autor = atendimento registrado por alguém.
    await prisma.interaction.create({
      data: {
        organizationId: cenarioA.organization.id,
        personId: pessoa.id,
        type: "CALL",
        memberId: cenarioA.membro.id,
        occurredAt: AGORA,
      },
    });

    expect((await buscarNovosContatos(cenarioA.organization.id, TODA_A_ORGANIZACAO)).total).toBe(0);
  });

  test("cliente que volta: contato NOVO depois de um atendimento ANTIGO reabre a fila", async () => {
    // É a diferença entre comparar instantes e comparar existência. Um
    // cliente antigo que manda mensagem hoje precisa ser atendido hoje.
    cenarioA = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });
    await prisma.interaction.create({
      data: {
        organizationId: cenarioA.organization.id,
        personId: pessoa.id,
        type: "CALL",
        memberId: cenarioA.membro.id,
        occurredAt: ANTEONTEM,
      },
    });
    await contatoDoSite({
      organizationId: cenarioA.organization.id,
      personId: pessoa.id,
      occurredAt: AGORA,
    });

    expect((await buscarNovosContatos(cenarioA.organization.id, TODA_A_ORGANIZACAO)).total).toBe(1);
  });

  test("oportunidade criada depois do contato também tira da fila", async () => {
    cenarioA = await criarCenario();
    const imovel = await criarImovel({ organizationId: cenarioA.organization.id });
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });
    await contatoDoSite({
      organizationId: cenarioA.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      occurredAt: ONTEM,
    });

    await prisma.propertyInterest.create({
      data: {
        organizationId: cenarioA.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        responsibleMemberId: cenarioA.membro.id,
      },
    });

    expect((await buscarNovosContatos(cenarioA.organization.id, TODA_A_ORGANIZACAO)).total).toBe(0);
  });

  test("interação registrada à mão nunca entra na caixa de entrada", async () => {
    // Ela tem autor: é trabalho feito, não trabalho a fazer.
    cenarioA = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });
    await prisma.interaction.create({
      data: {
        organizationId: cenarioA.organization.id,
        personId: pessoa.id,
        type: "CALL",
        memberId: cenarioA.membro.id,
      },
    });

    expect((await buscarNovosContatos(cenarioA.organization.id, TODA_A_ORGANIZACAO)).total).toBe(0);
  });

  test("interação sem origem de site não entra — não é captação", async () => {
    cenarioA = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });
    await prisma.interaction.create({
      data: {
        organizationId: cenarioA.organization.id,
        personId: pessoa.id,
        type: "MESSAGE",
        memberId: null,
        origin: null,
      },
    });

    expect((await buscarNovosContatos(cenarioA.organization.id, TODA_A_ORGANIZACAO)).total).toBe(0);
  });

  test("tenant isolation: contato de outra organização nunca aparece", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    const pessoaB = await criarPessoa({
      organizationId: cenarioB.organization.id,
      name: "Pessoa Sigilosa De B",
    });
    await contatoDoSite({ organizationId: cenarioB.organization.id, personId: pessoaB.id });

    const deA = await buscarNovosContatos(cenarioA.organization.id, TODA_A_ORGANIZACAO);
    expect(deA.total).toBe(0);
    expect(JSON.stringify(deA)).not.toContain("Sigilosa");

    // E continua visível no tenant dele: a barreira é o escopo.
    expect((await buscarNovosContatos(cenarioB.organization.id, TODA_A_ORGANIZACAO)).total).toBe(1);
  });

  // Fase 36 — o alcance da FILA mudou, e mudou exatamente uma vez.
  //
  // Antes: o membro via só os contatos de quem já tinha vínculo comercial
  // com ele — o que deixava todo lead novo do site invisível para todo
  // corretor, sem nenhuma forma de lhe dar um dono.
  //
  // Agora: ele vê os seus MAIS os que não são de ninguém (trabalho em
  // aberto da organização, que é o que a fila existe para distribuir).
  // O que continua fora, e é o que este teste protege: lead de COLEGA.
  test("escopo restrito: os meus, os sem dono — e NUNCA o lead de um colega", async () => {
    cenarioA = await criarCenario();
    const imovel = await criarImovel({ organizationId: cenarioA.organization.id });
    const minha = await criarPessoa({ organizationId: cenarioA.organization.id, name: "Minha" });
    const alheia = await criarPessoa({ organizationId: cenarioA.organization.id, name: "Alheia" });
    const semDono = await criarPessoa({
      organizationId: cenarioA.organization.id,
      name: "SemDono",
    });

    // Um colega de verdade, dono da pessoa "Alheia".
    const usuarioColega = await criarUsuario({ name: "Colega" });
    const colega = await criarMembro({
      organizationId: cenarioA.organization.id,
      userId: usuarioColega.id,
      role: "BROKER",
    });
    await prisma.person.updateMany({
      where: { id: alheia.id, organizationId: cenarioA.organization.id },
      data: { responsibleMemberId: colega.id },
    });

    // Vínculo comercial = negociação conduzida por mim. Criada ANTES do
    // contato novo, para não tirar o contato da fila.
    await prisma.propertyInterest.create({
      data: {
        organizationId: cenarioA.organization.id,
        personId: minha.id,
        propertyId: imovel.id,
        responsibleMemberId: cenarioA.membro.id,
        createdAt: ANTEONTEM,
      },
    });

    await contatoDoSite({
      organizationId: cenarioA.organization.id,
      personId: minha.id,
      occurredAt: AGORA,
    });
    await contatoDoSite({
      organizationId: cenarioA.organization.id,
      personId: alheia.id,
      occurredAt: AGORA,
    });
    await contatoDoSite({
      organizationId: cenarioA.organization.id,
      personId: semDono.id,
      occurredAt: AGORA,
    });

    const restrito = await buscarNovosContatos(cenarioA.organization.id, {
      tipo: "MEMBRO",
      memberId: cenarioA.membro.id,
    });
    // O meu (por negociação) e o que não é de ninguém.
    expect(restrito.total).toBe(2);
    const nomes = restrito.itens.map((i) => i.pessoa.nome).sort();
    expect(nomes).toEqual(["Minha", "SemDono"]);
    // PII do lead de um colega não sai do banco.
    expect(JSON.stringify(restrito)).not.toContain("Alheia");

    // A posse aparece na fila — e aqui está a invariante central da
    // fase, visível num dado real: "Minha" é minha POR NEGOCIAÇÃO e
    // mesmo assim continua SEM RESPONSÁVEL PELA PESSOA. Conduzir um
    // negócio com alguém não é ser dono do lead dela, e a fila não
    // finge que é.
    expect(restrito.itens.every((i) => i.responsavel === null)).toBe(true);

    // A camada gerencial continua vendo os três.
    expect((await buscarNovosContatos(cenarioA.organization.id, TODA_A_ORGANIZACAO)).total).toBe(3);
  });

  test("ordem é o relógio: mais recente primeiro, e a espera é calculada", async () => {
    cenarioA = await criarCenario();
    const antiga = await criarPessoa({ organizationId: cenarioA.organization.id, name: "Antiga" });
    const recente = await criarPessoa({ organizationId: cenarioA.organization.id, name: "Recente" });
    await contatoDoSite({
      organizationId: cenarioA.organization.id,
      personId: antiga.id,
      occurredAt: ANTEONTEM,
    });
    await contatoDoSite({
      organizationId: cenarioA.organization.id,
      personId: recente.id,
      occurredAt: AGORA,
    });

    const { itens } = await buscarNovosContatos(cenarioA.organization.id, TODA_A_ORGANIZACAO);
    expect(itens.map((i) => i.pessoa.nome)).toEqual(["Recente", "Antiga"]);
    expect(itens[0].aguardandoHaHoras).toBe(0);
    expect(itens[1].aguardandoHaHoras).toBeGreaterThanOrEqual(47);
  });

  test("a lista é truncada pelo limite, a contagem nunca", async () => {
    cenarioA = await criarCenario();
    for (let i = 0; i < 4; i++) {
      const p = await criarPessoa({
        organizationId: cenarioA.organization.id,
        name: `Contato ${i}`,
      });
      await contatoDoSite({ organizationId: cenarioA.organization.id, personId: p.id });
    }

    const { itens, total } = await buscarNovosContatos(
      cenarioA.organization.id,
      TODA_A_ORGANIZACAO,
      { limite: 2 }
    );
    expect(itens).toHaveLength(2);
    expect(total).toBe(4);
  });

  test("sem contatos: estado vazio, sem erro", async () => {
    cenarioA = await criarCenario();
    const vazio = await buscarNovosContatos(cenarioA.organization.id, TODA_A_ORGANIZACAO);
    expect(vazio).toEqual({ itens: [], total: 0, truncado: false });
  });
});

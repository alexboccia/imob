import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarImovel, criarMembro, criarPessoa, criarUsuario } from "@/test/fixtures";
import { buscarCentralTrabalho } from "@/lib/central-trabalho";
import { whereAtividade } from "@/lib/escopo-comercial";
import { responsavelEfetivoDaAtividade } from "@/lib/responsavel-atividade";

// =======================================================================
// De quem é um compromisso
// =======================================================================
// A Fase 32 acrescentou UMA dimensão de posse e não pode ter mexido na
// que já existia. Estes testes provam a regra pelo comportamento real da
// Central (o lugar onde a posse decide o que aparece), não pelo formato
// do `where` — um teste de formato passaria mesmo com a semântica errada.

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

const AMANHA = () => new Date(Date.now() + 24 * 3600_000);

async function segundoMembro(cenario: Cenario) {
  const usuario = await criarUsuario();
  return criarMembro({
    organizationId: cenario.organization.id,
    userId: usuario.id,
    role: "BROKER",
  });
}

async function atividade(opcoes: {
  organizationId: string;
  personId: string;
  propertyInterestId?: string | null;
  responsibleMemberId?: string | null;
  createdByMemberId?: string | null;
}) {
  return prisma.scheduledActivity.create({
    data: {
      organizationId: opcoes.organizationId,
      personId: opcoes.personId,
      propertyInterestId: opcoes.propertyInterestId ?? null,
      responsibleMemberId: opcoes.responsibleMemberId ?? null,
      createdByMemberId: opcoes.createdByMemberId ?? null,
      type: "FOLLOW_UP",
      subject: "Ligar para confirmar",
      scheduledAt: AMANHA(),
    },
    select: { id: true },
  });
}

async function idsNaCentralDe(cenario: Cenario, memberId: string): Promise<string[]> {
  const central = await buscarCentralTrabalho(cenario.organization.id, memberId, "UTC");
  return central.proximas.map((c) => c.id);
}

describe("posse de ScheduledActivity — precedência da negociação", () => {
  test("com negociação: pertence a quem conduz a negociação", async () => {
    const cenario = await novoCenario();
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const negociacao = await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        responsibleMemberId: cenario.membro.id,
      },
      select: { id: true },
    });
    const a = await atividade({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyInterestId: negociacao.id,
    });

    expect(await idsNaCentralDe(cenario, cenario.membro.id)).toContain(a.id);
  });

  test("A NEGOCIAÇÃO VENCE: responsibleMemberId da atividade não sequestra o compromisso", async () => {
    // O caso que não pode existir: dado inconsistente (ou futuro fluxo
    // descuidado) gravando as duas dimensões. Quem manda é a negociação.
    const cenario = await novoCenario();
    const outro = await segundoMembro(cenario);
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const negociacao = await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        responsibleMemberId: cenario.membro.id,
      },
      select: { id: true },
    });
    const a = await atividade({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyInterestId: negociacao.id,
      responsibleMemberId: outro.id,
    });

    expect(await idsNaCentralDe(cenario, cenario.membro.id)).toContain(a.id);
    expect(await idsNaCentralDe(cenario, outro.id)).not.toContain(a.id);
  });

  test("sem negociação: pertence ao responsável da própria atividade", async () => {
    const cenario = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const a = await atividade({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      responsibleMemberId: cenario.membro.id,
    });

    expect(await idsNaCentralDe(cenario, cenario.membro.id)).toContain(a.id);
  });

  test("sem negociação: não pertence a outro membro", async () => {
    const cenario = await novoCenario();
    const outro = await segundoMembro(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const a = await atividade({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      responsibleMemberId: cenario.membro.id,
    });

    expect(await idsNaCentralDe(cenario, outro.id)).not.toContain(a.id);
  });

  test("histórica sem negociação e sem responsável: comportamento de antes, de ninguém", async () => {
    const cenario = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const a = await atividade({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      // Nem negociação, nem responsável. Só autoria — que NUNCA é posse.
      createdByMemberId: cenario.membro.id,
    });

    expect(await idsNaCentralDe(cenario, cenario.membro.id)).not.toContain(a.id);
  });

  test("autoria não é posse: criar para outro não torna o compromisso do criador", async () => {
    const cenario = await novoCenario();
    const outro = await segundoMembro(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const a = await atividade({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      responsibleMemberId: outro.id,
      createdByMemberId: cenario.membro.id,
    });

    expect(await idsNaCentralDe(cenario, outro.id)).toContain(a.id);
    expect(await idsNaCentralDe(cenario, cenario.membro.id)).not.toContain(a.id);
  });

  test("tenant: compromisso de outra organização nunca entra na Central", async () => {
    const meu = await novoCenario();
    const alheio = await novoCenario();
    const pessoaAlheia = await criarPessoa({ organizationId: alheio.organization.id });
    const a = await atividade({
      organizationId: alheio.organization.id,
      personId: pessoaAlheia.id,
      responsibleMemberId: alheio.membro.id,
    });

    expect(await idsNaCentralDe(meu, meu.membro.id)).not.toContain(a.id);
    expect(await idsNaCentralDe(alheio, alheio.membro.id)).toContain(a.id);
  });
});

describe("escopo comercial restrito", () => {
  test("o corretor alcança o próprio compromisso sem negociação", async () => {
    const cenario = await novoCenario();
    const outro = await segundoMembro(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const meu = await atividade({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      responsibleMemberId: cenario.membro.id,
    });
    const alheio = await atividade({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      responsibleMemberId: outro.id,
    });

    const visiveis = await prisma.scheduledActivity.findMany({
      where: {
        organizationId: cenario.organization.id,
        ...whereAtividade({ tipo: "MEMBRO", memberId: cenario.membro.id }),
      },
      select: { id: true },
    });
    const ids = visiveis.map((v) => v.id);
    expect(ids).toContain(meu.id);
    expect(ids).not.toContain(alheio.id);
  });

  test("a visão de organização continua vendo tudo — nenhuma visibilidade reduzida", async () => {
    const cenario = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const semDono = await atividade({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
    });

    const visiveis = await prisma.scheduledActivity.findMany({
      where: {
        organizationId: cenario.organization.id,
        ...whereAtividade({ tipo: "ORGANIZACAO" }),
      },
      select: { id: true },
    });
    expect(visiveis.map((v) => v.id)).toContain(semDono.id);
  });
});

describe("responsavelEfetivoDaAtividade", () => {
  test("a mesma precedência, para quem já tem o registro em mãos", () => {
    expect(
      responsavelEfetivoDaAtividade({
        propertyInterestId: "neg-1",
        responsibleMemberId: "membro-b",
        propertyInterest: { responsibleMemberId: "membro-a" },
      })
    ).toBe("membro-a");

    expect(
      responsavelEfetivoDaAtividade({
        propertyInterestId: null,
        responsibleMemberId: "membro-b",
      })
    ).toBe("membro-b");

    expect(
      responsavelEfetivoDaAtividade({ propertyInterestId: null, responsibleMemberId: null })
    ).toBeNull();
  });
});

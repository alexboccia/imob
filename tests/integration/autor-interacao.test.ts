import { describe, test, expect, afterEach, vi } from "vitest";

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
import { criarCenario, criarPessoa, criarImovel, criarUsuario, criarMembro } from "@/test/fixtures";
import { auth } from "@/lib/auth";
import {
  registrarInteracao,
  criarInteressePessoa,
} from "@/app/app/clientes/actions";
import {
  criarAgendamentoVisita,
  concluirAgendamentoVisita,
} from "@/app/app/agendamentos/actions";
import { enviarContato, enviarAnuncioProprietario } from "@/app/[orgSlug]/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { paraAutorInteracao, rotuloAutorInteracao } from "@/lib/autor-interacao";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

const cenarios: Cenario[] = [];
afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  autenticarComo(cenario, cenario.membro.id);
  return cenario;
}

function autenticarComo(cenario: Cenario, membroId: string | undefined) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: membroId,
      role: "OWNER",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

function formPublico(campos: Record<string, string>) {
  const fd = form(campos);
  // Passa da checagem anti-bot de tempo mínimo (protecoesAntiSpam).
  fd.set("renderizadoEm", String(Date.now() - 5000));
  return fd;
}

async function outroMembro(organizationId: string, nome: string) {
  const usuario = await criarUsuario({ name: nome });
  const membro = await criarMembro({ organizationId, userId: usuario.id, role: "BROKER" });
  return { ...membro, nome };
}

async function interacoesDe(organizationId: string) {
  return prisma.interaction.findMany({
    where: { organizationId },
    select: { id: true, type: true, origin: true, memberId: true, personId: true },
    orderBy: { occurredAt: "asc" },
  });
}

describe("interação MANUAL — ator interno determinístico", () => {
  test("registra o membro que executou a ação", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });

    await registrarInteracao(pessoa.id, form({ tipo: "CALL", notas: "Ligação de retorno" }));

    const [interacao] = await interacoesDe(c.organization.id);
    expect(interacao.type).toBe("CALL");
    expect(interacao.memberId).toBe(c.membro.id);
    // Interação interna não tem origem de site.
    expect(interacao.origin).toBeNull();
  });

  test("AUTOR != RESPONSÁVEL: Bruno registra, Ana continua responsável", async () => {
    const c = await novoCenario();
    const ana = await outroMembro(c.organization.id, "Ana Responsavel");
    const bruno = await outroMembro(c.organization.id, "Bruno Souza");
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });

    // Ana fica responsável pela negociação.
    await criarInteressePessoa(
      pessoa.id,
      ESTADO_INICIAL_ACAO,
      form({ propertyId: imovel.id, responsavelId: ana.id })
    );

    // Bruno liga para o cliente.
    autenticarComo(c, bruno.id);
    await registrarInteracao(pessoa.id, form({ tipo: "CALL", notas: "Follow-up" }));

    const [interacao] = await interacoesDe(c.organization.id);
    expect(interacao.memberId).toBe(bruno.id);

    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId: c.organization.id, personId: pessoa.id },
      select: { responsibleMemberId: true },
    });
    // O ponto central: registrar interação NÃO reatribui a negociação.
    expect(interesse.responsibleMemberId).toBe(ana.id);
    expect(interesse.responsibleMemberId).not.toBe(interacao.memberId);
  });

  test("sessão sem vínculo de organização grava null — o fato não é bloqueado", async () => {
    const c = await novoCenario();
    autenticarComo(c, undefined);
    const pessoa = await criarPessoa({ organizationId: c.organization.id });

    await registrarInteracao(pessoa.id, form({ tipo: "MESSAGE", notas: "Sem membro" }));

    const [interacao] = await interacoesDe(c.organization.id);
    expect(interacao.memberId).toBeNull();
    // A interação existe do mesmo jeito.
    expect(interacao.type).toBe("MESSAGE");
  });

  test("membro de OUTRA organização na sessão nunca vira FK cross-tenant", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);

    // Sessão inconsistente: organização A, memberId da organização B.
    autenticarComo(a, b.membro.id);
    const pessoa = await criarPessoa({ organizationId: a.organization.id });
    await registrarInteracao(pessoa.id, form({ tipo: "CALL", notas: "x" }));

    const [interacao] = await interacoesDe(a.organization.id);
    // Redigido para null em vez de gravar o membro do outro tenant.
    expect(interacao.memberId).toBeNull();
    expect(interacao.memberId).not.toBe(b.membro.id);
  });

  test("autoria sobrevive à suspensão do membro", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Souza");
    const pessoa = await criarPessoa({ organizationId: c.organization.id });

    autenticarComo(c, bruno.id);
    await registrarInteracao(pessoa.id, form({ tipo: "CALL", notas: "x" }));
    await prisma.organizationMember.update({
      where: { id: bruno.id },
      data: { status: "SUSPENDED" },
    });

    const linha = await prisma.interaction.findFirstOrThrow({
      where: { organizationId: c.organization.id },
      select: {
        origin: true,
        member: {
          select: {
            id: true,
            status: true,
            organizationId: true,
            user: { select: { name: true } },
          },
        },
      },
    });
    const autor = paraAutorInteracao(linha.member, c.organization.id);
    // Suspender não apaga o que a pessoa fez.
    expect(autor).toMatchObject({ nome: "Bruno Souza", inativo: true });
    expect(rotuloAutorInteracao(autor, linha.origin)).toBe("Bruno Souza (inativo)");
  });
});

describe("captação PÚBLICA — nunca recebe ator interno", () => {
  test("contato pela página do IMÓVEL fica sem autor", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });

    await enviarContato(
      c.organization.slug,
      undefined,
      formPublico({
        nome: "Visitante Um",
        email: "visitante.um@example.com",
        telefone: "11999990001",
        mensagem: "Tenho interesse neste imóvel",
        imovelId: imovel.id,
      })
    );

    const [interacao] = await interacoesDe(c.organization.id);
    expect(interacao.origin).toBe("IMOVEL");
    // Quem originou foi o visitante — nenhum corretor é atribuído.
    expect(interacao.memberId).toBeNull();
    // E a tela NÃO diz "autor não registrado": o fato é completo.
    expect(rotuloAutorInteracao(null, interacao.origin)).toBeNull();
  });

  test("contato pela página de CONTATO fica sem autor", async () => {
    const c = await novoCenario();

    await enviarContato(
      c.organization.slug,
      undefined,
      formPublico({
        nome: "Visitante Dois",
        email: "visitante.dois@example.com",
        telefone: "11999990002",
        mensagem: "Gostaria de falar com um corretor",
      })
    );

    const [interacao] = await interacoesDe(c.organization.id);
    expect(interacao.origin).toBe("CONTATO");
    expect(interacao.memberId).toBeNull();
  });

  test("pedido de ANÚNCIO fica sem autor", async () => {
    const c = await novoCenario();

    await enviarAnuncioProprietario(
      c.organization.slug,
      undefined,
      formPublico({
        nome: "Proprietario Um",
        email: "proprietario.um@example.com",
        telefone: "11999990003",
        descricaoImovel: "Apartamento de 2 quartos no Centro",
      })
    );

    const [interacao] = await interacoesDe(c.organization.id);
    expect(interacao.origin).toBe("ANUNCIE");
    expect(interacao.memberId).toBeNull();
  });

  test("existir responsável pelo cliente NÃO contamina a captação pública", async () => {
    const c = await novoCenario();
    const ana = await outroMembro(c.organization.id, "Ana Responsavel");
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });

    // Primeiro o contato público cria a Person...
    await enviarContato(
      c.organization.slug,
      undefined,
      formPublico({
        nome: "Visitante Tres",
        email: "visitante.tres@example.com",
        telefone: "11999990004",
        mensagem: "Interesse",
        imovelId: imovel.id,
      })
    );
    const pessoa = await prisma.person.findFirstOrThrow({
      where: { organizationId: c.organization.id },
      select: { id: true },
    });
    // ...depois a equipe cria a oportunidade com responsável.
    await criarInteressePessoa(
      pessoa.id,
      ESTADO_INICIAL_ACAO,
      form({ propertyId: imovel.id, responsavelId: ana.id })
    );

    const [captacao] = await interacoesDe(c.organization.id);
    // A autoria da captação continua externa, mesmo com responsável
    // definido depois.
    expect(captacao.memberId).toBeNull();
    expect(captacao.origin).toBe("IMOVEL");
  });
});

describe("interação de VISITA", () => {
  test("concluir a visita registra quem concluiu como autor", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Souza");
    const carla = await outroMembro(c.organization.id, "Carla Corretora");
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await criarInteressePessoa(pessoa.id, ESTADO_INICIAL_ACAO, form({ propertyId: imovel.id }));
    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId: c.organization.id, personId: pessoa.id },
      select: { id: true },
    });

    autenticarComo(c, bruno.id);
    const amanha = new Date(Date.now() + 24 * 3600 * 1000);
    await criarAgendamentoVisita(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      form({ scheduledAt: `${amanha.toISOString().slice(0, 10)}T10:00` })
    );
    const atividade = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: c.organization.id, propertyInterestId: interesse.id },
      select: { id: true },
    });

    // Quem CONCLUI é a Carla — e é ela a autora da interação de visita.
    autenticarComo(c, carla.id);
    await concluirAgendamentoVisita(atividade.id, ESTADO_INICIAL_ACAO, new FormData());

    const visita = await prisma.interaction.findFirstOrThrow({
      where: { organizationId: c.organization.id, type: "VISIT" },
      select: { memberId: true, origin: true },
    });
    expect(visita.memberId).toBe(carla.id);
    // Visita registrada pela equipe não tem origem de site.
    expect(visita.origin).toBeNull();
  });

  test("membro de outro tenant na sessão não vira autor da visita", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);

    const pessoa = await criarPessoa({ organizationId: a.organization.id });
    const imovel = await criarImovel({ organizationId: a.organization.id });
    await criarInteressePessoa(pessoa.id, ESTADO_INICIAL_ACAO, form({ propertyId: imovel.id }));
    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId: a.organization.id, personId: pessoa.id },
      select: { id: true },
    });
    const amanha = new Date(Date.now() + 24 * 3600 * 1000);
    await criarAgendamentoVisita(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      form({ scheduledAt: `${amanha.toISOString().slice(0, 10)}T10:00` })
    );
    const atividade = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: a.organization.id, propertyInterestId: interesse.id },
      select: { id: true },
    });

    autenticarComo(a, b.membro.id);
    await concluirAgendamentoVisita(atividade.id, ESTADO_INICIAL_ACAO, new FormData());

    const visita = await prisma.interaction.findFirstOrThrow({
      where: { organizationId: a.organization.id, type: "VISIT" },
      select: { memberId: true },
    });
    expect(visita.memberId).toBeNull();
    expect(visita.memberId).not.toBe(b.membro.id);
  });
});

describe("legado", () => {
  test("interação antiga sem ator permanece sem ator — zero backfill", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const ana = await outroMembro(c.organization.id, "Ana Responsavel");
    const imovel = await criarImovel({ organizationId: c.organization.id });

    // Legado: interação interna sem autor e sem origem.
    const legada = await prisma.interaction.create({
      data: {
        organizationId: c.organization.id,
        personId: pessoa.id,
        type: "CALL",
        notes: "Registro antigo",
      },
      select: { id: true },
    });

    // Mesmo criando responsável depois, nada é inferido para trás.
    await criarInteressePessoa(
      pessoa.id,
      ESTADO_INICIAL_ACAO,
      form({ propertyId: imovel.id, responsavelId: ana.id })
    );

    const linha = await prisma.interaction.findUniqueOrThrow({
      where: { id: legada.id, organizationId: c.organization.id },
      select: { memberId: true, origin: true },
    });
    expect(linha.memberId).toBeNull();
    // Sem origem e sem ator: aí sim "Autor não registrado".
    expect(rotuloAutorInteracao(null, linha.origin)).toBe("Autor não registrado");
  });
});

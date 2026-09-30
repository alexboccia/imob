import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { intervaloDoDia } from "@/lib/fuso-horario";
import { ESTAGIOS_INTERESSE } from "@/lib/property-interest-schema";
import { atividadeDoMembro } from "@/lib/responsavel-atividade";
import { obterProximaAcaoComercial, type ProximaAcaoComercial } from "@/lib/proxima-acao-comercial";
import { PAGE_SIZE_MAXIMO } from "@/lib/pagination";
import type { ScheduledActivityType } from "@/generated/prisma/client";

// =======================================================================
// Central de trabalho (Fase 17)
// =======================================================================
// Responde "o que eu preciso fazer agora?" a partir de FATOS que o
// domínio já registra. Nenhum modelo novo, nenhuma migration, nenhum
// score.
//
// -----------------------------------------------------------------------
// O QUE É "MEU"
// -----------------------------------------------------------------------
// `ScheduledActivity` NÃO tem responsável: só `createdByMemberId`, que é
// quem CRIOU o agendamento — e criar não é ser dono (mesma distinção das
// Fases 11/14/15). O vínculo factual é indireto e determinístico:
//
//   ScheduledActivity.propertyInterestId
//     -> PropertyInterest.responsibleMemberId   (Fase 11)
//
// Ou seja: uma visita é minha quando a NEGOCIAÇÃO dela é minha. Isso não
// esconde trabalho: existe um único caminho de criação de atividade no
// produto (criarAgendamentoVisita), e ele sempre recebe um
// propertyInterestId. A coluna é nullable por defesa, não por fluxo.
//
// `Person.assignedMemberId` (responsável pelo CLIENTE) NÃO é usado como
// substituto — é outra dimensão, e a Fase 11 já separou as duas.
//
// -----------------------------------------------------------------------
// TEMPO (corrigido na Fase 18)
// -----------------------------------------------------------------------
// "Hoje" é o DIA CALENDÁRIO DA ORGANIZAÇÃO (Organization.timezone,
// fallback explícito UTC), resolvido por intervaloDoDia em
// src/lib/fuso-horario.ts — exatamente o mesmo helper que a Agenda usa,
// para as duas telas nunca discordarem sobre o que é hoje.
//
// A Fase 17 usava a convenção UTC-literal e registrou essa dívida no
// relatório: para uma imobiliária em UTC−3, o dia virava às 21:00 locais
// e uma visita das 22:00 aparecia como "próxima" em vez de "hoje". É esse
// defeito que esta fase corrige. O fuso chega pronto de quem carrega a
// tela: nenhuma consulta de fuso por item, zero N+1.
//
// As três categorias são MUTUAMENTE EXCLUSIVAS, exatamente como a Agenda
// já classifica:
//   ATRASADAS  SCHEDULED cujo DIA já passou
//   HOJE       SCHEDULED dentro do dia de hoje
//   PRÓXIMAS   SCHEDULED em um dia futuro
// Desde a Fase 19 isso vale para VISITA e FOLLOW-UP igualmente: o tipo
// muda o que se lê no card, nunca em qual bloco ele cai.
// Uma visita de hoje às 09:00 com agora 15:00 continua em HOJE, nunca em
// ATRASADAS: só o dia calendário conta, decisão de produto herdada da
// Fase H.3 e preservada aqui para as duas telas não se contradizerem.
//
// -----------------------------------------------------------------------
// O QUE ESTA CENTRAL NÃO AFIRMA
// -----------------------------------------------------------------------
// Nada de "lead quente", "risco de perda", "prioridade", "próxima melhor
// ação" ou score. Nenhum desses tem fato que o sustente no domínio. Os
// sinais derivados são só fatos verificáveis: "sem próximo compromisso"
// (agenda futura vazia), "atividade atrasada" (SCHEDULED cujo dia já
// passou, Fase 83) e "próxima ação" (rótulo determinístico por estágio,
// Fase 81, obterProximaAcaoComercial) — nunca combinados num score único.
//
// -----------------------------------------------------------------------
// "MINHAS NEGOCIAÇÕES" — SELEÇÃO E ORDEM (Fase 89)
// -----------------------------------------------------------------------
// Achado: até esta fase, `take: limite` (5) acontecia na MESMA query que
// ordenava por `updatedAt asc` — o banco escolhia as 5 negociações
// "mexidas há mais tempo" ANTES de qualquer fato operacional
// (atividadeAtrasada/semProximoCompromisso) ser sequer calculado. Um
// corretor com 6+ negociações abertas podia ter uma com atividade
// ATRASADA completamente escondida atrás de 5 negociações saudáveis, só
// por causa de updatedAt (achado provado em teste antes da correção —
// ver describe "priorização operacional do top-5").
//
// A correção NÃO cria prioridade/score: agrupa por um fato já existente
// e documentado, sempre nesta ordem —
//   1. tem atividade atrasada          (Fase 83)
//   2. está sem NENHUM próximo passo   (Fase 83, semProximoCompromisso)
//   3. já tem próximo compromisso      (está com o próximo passo definido)
// — e dentro de cada grupo preserva a MESMA ordenação histórica ("mexida
// há mais tempo primeiro"), nunca um desempate novo.
//
// Correção também de SELEÇÃO, não só de ordem: a query candidata busca
// até PAGE_SIZE_MAXIMO (100, mesmo teto já usado em toda listagem
// paginada do produto — nunca um número novo) negociações abertas antes
// de aplicar a categorização, para que uma negociação urgente "fora dos
// 5 mais antigos por updatedAt" ainda seja encontrada. 100 é um teto de
// ENGENHARIA (evita carregar a organização inteira), não uma regra de
// negócio — a CONTAGEM (`total`) nunca é afetada por ele, só a lista.
// =======================================================================

// Teto de exibição de cada lista. A CONTAGEM continua exata e vem de
// query própria — a lista é truncada, o número nunca.
export const LIMITE_CENTRAL = 5;

export type CompromissoCentral = {
  id: string;
  // Fase 19 — a Central passou a mostrar VISITA e FOLLOW-UP. O tipo
  // atravessa como dado para a tela poder dizer o que é em TEXTO, nunca
  // só por cor ou ícone.
  tipo: ScheduledActivityType;
  // Só existe em FOLLOW_UP: o que precisa ser feito. null em VISIT — o
  // assunto de uma visita é visitar o imóvel.
  assunto: string | null;
  scheduledAtISO: string;
  notes: string | null;
  // null só na anomalia cross-tenant (FK simples), mesma defesa em
  // profundidade do Pipeline e da Agenda: a linha aparece, a relação
  // anômala é redigida, nenhum nome de outro tenant chega à tela.
  pessoa: { id: string; name: string } | null;
  imovel: { id: string; title: string } | null;
};

export type NegociacaoCentral = {
  id: string;
  stage: string;
  pessoa: { id: string; name: string } | null;
  imovel: { id: string; title: string } | null;
  // Fato verificável: nenhum compromisso SCHEDULED FUTURO para esta
  // negociação. Desde a Fase 19 isso inclui FOLLOW_UP — uma negociação
  // com follow-up marcado para amanhã NÃO pode continuar aparecendo como
  // "sem próximo compromisso". Não é "lead esquecido": é a ausência de
  // compromisso.
  //
  // Fase 83 — este campo SEMPRE foi sobre agenda FUTURA, nunca sobre
  // "nunca teve nada agendado": uma negociação com uma visita SCHEDULED
  // de 3 dias atrás (nunca concluída) também tinha semProximoCompromisso
  // = true, indistinguível de uma que nunca teve nada. Ver
  // atividadeAtrasada abaixo — o fato que faltava pra diferenciar as
  // duas situações (achado com teste já existente, nunca antes checado).
  semProximoCompromisso: boolean;
  // O compromisso futuro mais próximo (MIN(scheduledAt) > agora), quando
  // existe. Múltiplos compromissos futuros são permitidos — nenhum
  // unique artificial foi criado.
  proximoCompromisso: { tipo: ScheduledActivityType; assunto: string | null; scheduledAtISO: string } | null;
  // Fase 83 — a mais antiga atividade SCHEDULED cujo DIA já passou
  // (mesmo critério de "atrasada" do bloco `atrasadas` desta função e de
  // src/lib/scheduled-activity-date.ts — o mesmo `inicioHoje`, nunca uma
  // segunda definição). Independente de proximoCompromisso: uma
  // negociação pode ter as duas coisas ao mesmo tempo (visita vencida
  // ainda não resolvida E um follow-up já marcado pra semana que vem) —
  // os dois fatos são mostrados, nunca fundidos um no outro.
  atividadeAtrasada: { tipo: ScheduledActivityType; assunto: string | null; scheduledAtISO: string } | null;
  // Fase 88 — achado: uma visita CONCLUÍDA cria Interaction (Fase 37), mas
  // um follow-up concluído não (Fase 19/85, "planejado ≠ realizado" —
  // decisão deliberada, preservada aqui, nunca revertida). Consequência
  // não percebida até agora: uma negociação cujo único trabalho foi um
  // follow-up concluído ficava IDÊNTICA, nesta tela, a uma que nunca
  // recebeu nenhuma atenção (mesmo ultimoContatoISO=null, mesmo
  // semProximoCompromisso=true, mesmo atividadeAtrasada=null — nenhum
  // teste cobria essa distinção). Este campo fecha essa lacuna com um
  // FATO já existente (ScheduledActivity.status COMPLETED/NO_SHOW desta
  // negociação, scoped por negociação — não por pessoa, diferente de
  // ultimoContatoISO abaixo), nunca uma nova Interaction, nunca um
  // score. CANCELLED não conta: nada aconteceu, alguém só desmarcou.
  ultimaAtividadeConcluida: {
    tipo: ScheduledActivityType;
    assunto: string | null;
    scheduledAtISO: string;
  } | null;
  // Data da interação mais recente desta pessoa (Interaction.occurredAt,
  // quando o contato OCORREU — nunca createdAt). null = nenhuma
  // interação registrada, jamais "sem contato há muito tempo".
  ultimoContatoISO: string | null;
  // Fase 81 — mesma regra de sempre (obterProximaAcaoComercial), nunca
  // reimplementada: idêntica ao que Pipeline (paraItemPipeline) e as
  // fichas de cliente/imóvel já mostram para o mesmo PropertyInterest.
  // null só na anomalia cross-tenant (quando `imovel` também é null) —
  // sem um Property confiável não há status pra decidir a ação.
  proximaAcao: ProximaAcaoComercial | null;
};

export type CentralTrabalho = {
  atrasadas: { total: number; itens: CompromissoCentral[] };
  hoje: { total: number; itens: CompromissoCentral[] };
  // Próximas não tem horizonte em dias, de propósito: a Agenda já define
  // "próximas" como tudo depois de hoje, com teto defensivo de
  // apresentação. Inventar aqui uma janela de 7 ou 30 dias criaria duas
  // definições do mesmo conceito.
  proximas: CompromissoCentral[];
  negociacoes: { total: number; itens: NegociacaoCentral[] };
};

const SELECT_COMPROMISSO = {
  id: true,
  type: true,
  subject: true,
  scheduledAt: true,
  notes: true,
  person: { select: { id: true, name: true, organizationId: true } },
  property: { select: { id: true, title: true, organizationId: true } },
} as const;

type LinhaCompromisso = {
  id: string;
  type: ScheduledActivityType;
  subject: string | null;
  scheduledAt: Date;
  notes: string | null;
  person: { id: string; name: string; organizationId: string };
  property: { id: string; title: string; organizationId: string } | null;
};

export function paraCompromisso(
  linha: LinhaCompromisso,
  organizationId: string
): CompromissoCentral {
  return {
    id: linha.id,
    tipo: linha.type,
    assunto: linha.subject,
    scheduledAtISO: linha.scheduledAt.toISOString(),
    notes: linha.notes,
    pessoa:
      linha.person.organizationId === organizationId
        ? { id: linha.person.id, name: linha.person.name }
        : null,
    imovel:
      linha.property && linha.property.organizationId === organizationId
        ? { id: linha.property.id, title: linha.property.title }
        : null,
  };
}

// Filtro do eixo pessoal, em um lugar só: a atividade pertence a uma
// negociação desta organização cujo responsável é este membro. O
// `organizationId` é repetido dentro da relação pelo mesmo motivo de
// condicaoBusca no Pipeline — fechar o canal de vazamento indireto.
// Fase 32 — a posse deixou de ser sempre a da negociação: um
// compromisso SEM negociação pertence a quem tem de executá-lo. A regra
// inteira (e a precedência da negociação) vive em
// src/lib/responsavel-atividade.ts, para a Central, a Agenda e o escopo
// comercial nunca discordarem sobre de quem é um compromisso.
function daMinhaResponsabilidade(organizationId: string, memberId: string) {
  return atividadeDoMembro(memberId, organizationId);
}

export async function buscarCentralTrabalho(
  organizationId: string,
  memberId: string,
  // Fuso comercial da organização — obrigatório e sem padrão, mesma
  // convenção da Agenda: esquecer é erro de compilação, não UTC mudo.
  fuso: string,
  opcoes: { agora?: Date; limite?: number } = {}
): Promise<CentralTrabalho> {
  const agora = opcoes.agora ?? new Date();
  const limite = opcoes.limite ?? LIMITE_CENTRAL;
  const { inicio: inicioHoje, fim: fimHoje } = intervaloDoDia(agora, fuso);
  const meu = daMinhaResponsabilidade(organizationId, memberId);

  // Fase 19 — SEM filtro de `type`: a Central é a central de
  // COMPROMISSOS, e visita e follow-up são as duas formas que o produto
  // tem hoje. Filtrar por tipo aqui esconderia metade do trabalho do dia.
  const baseAtividade = {
    organizationId,
    status: "SCHEDULED" as const,
    ...meu,
  };

  return withOrganization(organizationId, async () => {
    const [
      totalAtrasadas,
      itensAtrasadas,
      totalHoje,
      itensHoje,
      itensProximas,
      totalNegociacoes,
      linhasNegociacoesCandidatas,
    ] = await Promise.all([
      prisma.scheduledActivity.count({
        where: { ...baseAtividade, scheduledAt: { lt: inicioHoje } },
      }),
      prisma.scheduledActivity.findMany({
        where: { ...baseAtividade, scheduledAt: { lt: inicioHoje } },
        // Mais antiga primeiro: o que está esperando há mais tempo é o
        // que trava a operação — e é a mesma leitura de uma fila.
        orderBy: { scheduledAt: "asc" },
        take: limite,
        select: SELECT_COMPROMISSO,
      }),
      prisma.scheduledActivity.count({
        where: { ...baseAtividade, scheduledAt: { gte: inicioHoje, lte: fimHoje } },
      }),
      prisma.scheduledActivity.findMany({
        where: { ...baseAtividade, scheduledAt: { gte: inicioHoje, lte: fimHoje } },
        orderBy: { scheduledAt: "asc" },
        take: limite,
        select: SELECT_COMPROMISSO,
      }),
      prisma.scheduledActivity.findMany({
        where: { ...baseAtividade, scheduledAt: { gt: fimHoje } },
        orderBy: { scheduledAt: "asc" },
        take: limite,
        select: SELECT_COMPROMISSO,
      }),
      prisma.propertyInterest.count({
        where: { organizationId, responsibleMemberId: memberId, stage: { in: [...ESTAGIOS_INTERESSE] } },
      }),
      // Fase 89 — janela de CANDIDATAS, não mais a lista final: até
      // PAGE_SIZE_MAXIMO negociações abertas, ordenadas por updatedAt
      // (a mesma base histórica), com TODAS as ScheduledActivity
      // SCHEDULED (não só a futura) — é o que permite categorizar por
      // atrasada/sem-passo/agendada em memória, abaixo, sem uma segunda
      // consulta por negociação. take:20 na relação é um teto defensivo
      // (uma negociação com dezenas de compromissos em aberto ao mesmo
      // tempo seria anomalia, não uso real).
      prisma.propertyInterest.findMany({
        where: { organizationId, responsibleMemberId: memberId, stage: { in: [...ESTAGIOS_INTERESSE] } },
        orderBy: { updatedAt: "asc" },
        take: PAGE_SIZE_MAXIMO,
        select: {
          id: true,
          stage: true,
          person: { select: { id: true, name: true, organizationId: true } },
          // status: true — Fase 81, único campo novo desta fase, na MESMA
          // consulta que já buscava id/title (zero query nova): é o que
          // obterProximaAcaoComercial precisa para decidir a ação.
          property: { select: { id: true, title: true, organizationId: true, status: true } },
          scheduledActivities: {
            where: { organizationId, status: "SCHEDULED" },
            orderBy: { scheduledAt: "asc" },
            take: 20,
            select: { id: true, type: true, subject: true, scheduledAt: true },
          },
        },
      }),
    ]);

    // Fase 89 — categoriza as CANDIDATAS (até PAGE_SIZE_MAXIMO) em
    // memória, usando só o que já foi buscado acima (zero query extra):
    // 1. tem atividade atrasada; 2. sem nenhum próximo passo; 3. já
    // agendada. .filter() preserva a ordem relativa (updatedAt asc) —
    // dentro de cada grupo o desempate continua sendo o histórico,
    // nunca um novo. .slice(0, limite) só DEPOIS de agrupar é a correção
    // do achado: antes, o corte acontecia no SQL, antes de qualquer fato
    // operacional existir.
    const candidatasComFatos = linhasNegociacoesCandidatas.map((linha) => {
      const atrasada = linha.scheduledActivities.find((a) => a.scheduledAt < inicioHoje) ?? null;
      const proxima = linha.scheduledActivities.find((a) => a.scheduledAt.getTime() > agora.getTime()) ?? null;
      return { linha, atrasada, proxima };
    });
    const categoria1 = candidatasComFatos.filter((c) => c.atrasada);
    const categoria2 = candidatasComFatos.filter((c) => !c.atrasada && !c.proxima);
    const categoria3 = candidatasComFatos.filter((c) => !c.atrasada && c.proxima);
    const linhasNegociacoes = [...categoria1, ...categoria2, ...categoria3].slice(0, limite);

    // Último contato de todas as pessoas da lista em UMA agregação, e
    // não uma query por negociação. A mesma ideia vale pra atividade
    // concluída por negociação, logo abaixo — as duas rodam juntas
    // porque as duas só existem depois de saber quais negociações
    // vieram na página (dependem de linhasNegociacoes). atividadeAtrasada
    // NÃO precisa de query própria aqui: já foi calculada acima, na
    // categorização, a partir do mesmo scheduledActivities já buscado —
    // Fase 89 elimina essa query em vez de acrescentar uma.
    const idsPessoas = [...new Set(linhasNegociacoes.map((c) => c.linha.person.id))];
    const idsNegociacoes = linhasNegociacoes.map((c) => c.linha.id);
    const [ultimosContatos, atividadesConcluidas] = await Promise.all([
      idsPessoas.length
        ? prisma.interaction.groupBy({
            by: ["personId"],
            where: { organizationId, personId: { in: idsPessoas } },
            _max: { occurredAt: true },
          })
        : Promise.resolve([]),
      // Fase 88 — a mais recente atividade que de fato ACONTECEU nesta
      // negociação (COMPLETED ou NO_SHOW — CANCELLED fica de fora, nada
      // ocorreu). scheduledAt, não completedAt: mesmo campo que
      // concluirAgendamentoVisita usa como occurredAt da Interaction
      // (Fase 37) — "quando aconteceu", não "quando alguém clicou
      // concluir". Ordenado descendente pra achar a mais recente por
      // negociação (Map.set só na primeira ocorrência, abaixo).
      idsNegociacoes.length
        ? prisma.scheduledActivity.findMany({
            where: {
              organizationId,
              status: { in: ["COMPLETED", "NO_SHOW"] },
              propertyInterestId: { in: idsNegociacoes },
            },
            orderBy: { scheduledAt: "desc" },
            select: { propertyInterestId: true, type: true, subject: true, scheduledAt: true },
          })
        : Promise.resolve([]),
    ]);
    const ultimoPorPessoa = new Map(
      ultimosContatos.map((linha) => [linha.personId, linha._max.occurredAt ?? null])
    );
    const concluidaPorNegociacao = new Map<
      string,
      { tipo: ScheduledActivityType; assunto: string | null; scheduledAtISO: string }
    >();
    for (const atividade of atividadesConcluidas) {
      const id = atividade.propertyInterestId!;
      if (concluidaPorNegociacao.has(id)) continue; // já tem a mais recente
      concluidaPorNegociacao.set(id, {
        tipo: atividade.type,
        assunto: atividade.subject,
        scheduledAtISO: atividade.scheduledAt.toISOString(),
      });
    }

    return {
      atrasadas: {
        total: totalAtrasadas,
        itens: itensAtrasadas.map((l) => paraCompromisso(l, organizationId)),
      },
      hoje: { total: totalHoje, itens: itensHoje.map((l) => paraCompromisso(l, organizationId)) },
      proximas: itensProximas.map((l) => paraCompromisso(l, organizationId)),
      negociacoes: {
        total: totalNegociacoes,
        itens: linhasNegociacoes.map(({ linha, atrasada, proxima }) => {
          const propertyConfiavel =
            linha.property && linha.property.organizationId === organizationId
              ? linha.property
              : null;
          return {
            id: linha.id,
            stage: linha.stage,
            pessoa:
              linha.person.organizationId === organizationId
                ? { id: linha.person.id, name: linha.person.name }
                : null,
            imovel: propertyConfiavel
              ? { id: propertyConfiavel.id, title: propertyConfiavel.title }
              : null,
            // Definições INALTERADAS desde a Fase 83/81 — só a FONTE dos
            // fatos mudou (derivada da lista completa de
            // scheduledActivities já buscada, não mais de um select
            // separado com where:{gt:agora} e take:1).
            semProximoCompromisso: !proxima,
            proximoCompromisso: proxima
              ? {
                  tipo: proxima.type,
                  assunto: proxima.subject,
                  scheduledAtISO: proxima.scheduledAt.toISOString(),
                }
              : null,
            ultimoContatoISO: ultimoPorPessoa.get(linha.person.id)?.toISOString() ?? null,
            atividadeAtrasada: atrasada
              ? {
                  tipo: atrasada.type,
                  assunto: atrasada.subject,
                  scheduledAtISO: atrasada.scheduledAt.toISOString(),
                }
              : null,
            ultimaAtividadeConcluida: concluidaPorNegociacao.get(linha.id) ?? null,
            proximaAcao: propertyConfiavel
              ? obterProximaAcaoComercial(linha.stage, propertyConfiavel.status)
              : null,
          };
        }),
      },
    };
  });
}

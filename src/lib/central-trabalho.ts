import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { intervaloDoDia } from "@/lib/fuso-horario";
import { ESTAGIOS_INTERESSE } from "@/lib/property-interest-schema";
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
// ação" ou score. Nenhum desses tem fato que o sustente no domínio. O
// único sinal derivado é "sem próximo compromisso", que é verificável:
// negociação aberta cuja agenda futura está vazia.
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
  // Fato verificável: nenhum compromisso SCHEDULED futuro para esta
  // negociação. Desde a Fase 19 isso inclui FOLLOW_UP — uma negociação
  // com follow-up marcado para amanhã NÃO pode continuar aparecendo como
  // "sem próximo compromisso". Não é "lead esquecido": é a ausência de
  // compromisso.
  semProximoCompromisso: boolean;
  // O compromisso futuro mais próximo (MIN(scheduledAt) > agora), quando
  // existe. Múltiplos compromissos futuros são permitidos — nenhum
  // unique artificial foi criado.
  proximoCompromisso: { tipo: ScheduledActivityType; assunto: string | null; scheduledAtISO: string } | null;
  // Data da interação mais recente desta pessoa (Interaction.occurredAt,
  // quando o contato OCORREU — nunca createdAt). null = nenhuma
  // interação registrada, jamais "sem contato há muito tempo".
  ultimoContatoISO: string | null;
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
function daMinhaResponsabilidade(organizationId: string, memberId: string) {
  return {
    propertyInterest: { is: { organizationId, responsibleMemberId: memberId } },
  };
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
      linhasNegociacoes,
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
      prisma.propertyInterest.findMany({
        where: { organizationId, responsibleMemberId: memberId, stage: { in: [...ESTAGIOS_INTERESSE] } },
        // Critério FACTUAL, nunca prioridade inventada: a negociação
        // mexida há mais tempo aparece primeiro.
        orderBy: { updatedAt: "asc" },
        take: limite,
        select: {
          id: true,
          stage: true,
          person: { select: { id: true, name: true, organizationId: true } },
          property: { select: { id: true, title: true, organizationId: true } },
          // Próxima visita agendada — batched pelo Prisma numa consulta
          // só para o conjunto inteiro, nunca uma por card (zero N+1).
          // Compromisso futuro mais próximo — batched pelo Prisma numa
          // consulta só para o conjunto inteiro, nunca uma por card
          // (zero N+1). Sem filtro de tipo: visita e follow-up contam.
          scheduledActivities: {
            where: { organizationId, status: "SCHEDULED", scheduledAt: { gt: agora } },
            orderBy: { scheduledAt: "asc" },
            take: 1,
            select: { id: true, type: true, subject: true, scheduledAt: true },
          },
        },
      }),
    ]);

    // Último contato de todas as pessoas da lista em UMA agregação, e
    // não uma query por negociação.
    const idsPessoas = [...new Set(linhasNegociacoes.map((l) => l.person.id))];
    const ultimosContatos = idsPessoas.length
      ? await prisma.interaction.groupBy({
          by: ["personId"],
          where: { organizationId, personId: { in: idsPessoas } },
          _max: { occurredAt: true },
        })
      : [];
    const ultimoPorPessoa = new Map(
      ultimosContatos.map((linha) => [linha.personId, linha._max.occurredAt ?? null])
    );

    return {
      atrasadas: {
        total: totalAtrasadas,
        itens: itensAtrasadas.map((l) => paraCompromisso(l, organizationId)),
      },
      hoje: { total: totalHoje, itens: itensHoje.map((l) => paraCompromisso(l, organizationId)) },
      proximas: itensProximas.map((l) => paraCompromisso(l, organizationId)),
      negociacoes: {
        total: totalNegociacoes,
        itens: linhasNegociacoes.map((linha) => ({
          id: linha.id,
          stage: linha.stage,
          pessoa:
            linha.person.organizationId === organizationId
              ? { id: linha.person.id, name: linha.person.name }
              : null,
          imovel:
            linha.property && linha.property.organizationId === organizationId
              ? { id: linha.property.id, title: linha.property.title }
              : null,
          semProximoCompromisso: linha.scheduledActivities.length === 0,
          proximoCompromisso: linha.scheduledActivities[0]
            ? {
                tipo: linha.scheduledActivities[0].type,
                assunto: linha.scheduledActivities[0].subject,
                scheduledAtISO: linha.scheduledActivities[0].scheduledAt.toISOString(),
              }
            : null,
          ultimoContatoISO: ultimoPorPessoa.get(linha.person.id)?.toISOString() ?? null,
        })),
      },
    };
  });
}

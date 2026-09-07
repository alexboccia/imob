import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { intervaloDoDia } from "@/lib/fuso-horario";
import { ESTAGIOS_INTERESSE } from "@/lib/property-interest-schema";
import {
  SEM_RESPONSAVEL_LABEL,
  membroPodeReceberNegociacao,
} from "@/lib/responsavel-negociacao";
import { LIMITE_CENTRAL, paraCompromisso, type CompromissoCentral } from "@/lib/central-trabalho";
import { temPapel, PAPEIS_VISAO_EQUIPE } from "@/lib/authorization";

// =======================================================================
// Visão de equipe da Central (Fase 21)
// =======================================================================
// Responde "o que está acontecendo comercialmente na equipe agora?" com
// os mesmos FATOS da Central pessoal, agregados por responsável.
//
// NÃO É UM RANKING. Contagem não é desempenho, atraso não é culpa, e
// nenhum número aqui é score, capacidade, risco ou produtividade. São as
// mesmas três categorias temporais da Fase 17/18 somadas por pessoa.
//
// -----------------------------------------------------------------------
// TEMPO
// -----------------------------------------------------------------------
// ZERO helper paralelo: usa o MESMO intervaloDoDia da Fase 18, com o
// fuso da organização. Se a equipe e a Agenda discordassem sobre o que é
// "hoje", a visão gerencial seria pior que nenhuma.
//
// -----------------------------------------------------------------------
// DE QUEM É O TRABALHO
// -----------------------------------------------------------------------
// Do RESPONSÁVEL PELA NEGOCIAÇÃO (PropertyInterest.responsibleMemberId),
// nunca de createdByMemberId — criar não é ser dono (Fases 14/17/19).
// Uma atividade sem propertyInterestId não tem dono objetivo e por isso
// NÃO é atribuída a ninguém; ela é contada à parte (ver
// `semNegociacao`), em vez de ser inventada para o criador.
//
// -----------------------------------------------------------------------
// COMO ISSO NÃO VIRA N+1
// -----------------------------------------------------------------------
// Nenhuma consulta por membro. Uma imobiliária pode ter 100+ pessoas e o
// número de queries é constante:
//
//   1 groupBy  negociações abertas por responsável   (agrega no Postgres,
//              incluindo o balde null = sem responsável)
//   3 groupBy  atividades SCHEDULED por negociação, uma por balde
//              temporal (atrasadas / hoje / próximas)
//   1 findMany negociação -> responsável, só para os ids acima
//   1 findMany nomes/status dos membros envolvidos
//   1 findMany a lista curta de atrasadas, para exibição
//
// Os três groupBy de atividade colapsam no BANCO: cada linha devolvida é
// uma NEGOCIAÇÃO com compromisso pendente naquele balde, não uma
// atividade. O conjunto é limitado pelo pipeline aberto da organização,
// nunca pelo histórico de atividades — é essa a diferença entre agregar e
// "carregar tudo para contar em JS".
// =======================================================================

// -----------------------------------------------------------------------
// Qual visão o servidor entrega
// -----------------------------------------------------------------------
// Função PURA e nomeada, e não um booleano solto dentro do page.tsx: é a
// regra de autorização da fase, e regra de autorização merece ser
// testável isoladamente e exaustivamente.
//
// O parâmetro `?visao=equipe` é apenas um PEDIDO. Quem decide é esta
// função, no servidor. Um BROKER que digite o parâmetro na URL recebe
// "pessoal" — não uma tela de acesso negado, e sim exatamente a Central
// que ele sempre teve, porque para ele nada mudou.
export const VISAO_EQUIPE = "equipe";

export type VisaoCentral = "pessoal" | "equipe";

export function resolverVisaoCentral(contexto: {
  role: string | undefined;
  temCrm: boolean;
  // Valor CRU da query string — nunca confiado, só consultado.
  visaoPedida: string | undefined;
}): { visao: VisaoCentral; podeVerEquipe: boolean } {
  // Sem CRM não há nem Central nem equipe: é o mesmo gate de módulo que
  // Agenda, Clientes e Pipeline aplicam.
  const podeVerEquipe = contexto.temCrm && temPapel(contexto.role, PAPEIS_VISAO_EQUIPE);
  const pediuEquipe = contexto.visaoPedida === VISAO_EQUIPE;
  return { visao: podeVerEquipe && pediuEquipe ? "equipe" : "pessoal", podeVerEquipe };
}

export type LinhaEquipe = {
  // null = o balde "sem responsável". Não é um id de membro.
  memberId: string | null;
  nome: string;
  // true quando o membro não está ACTIVE. O nome permanece e ganha a
  // marca de inativo — nunca vira "Sem responsável", que afirmaria que o
  // negócio não tinha dono (convenção da Fase 11).
  inativo: boolean;
  negociacoesAbertas: number;
  atrasadas: number;
  hoje: number;
  proximas: number;
};

export type CompromissoEquipe = CompromissoCentral & {
  // Quem conduz a negociação deste compromisso. null = sem responsável.
  responsavel: { nome: string; inativo: boolean } | null;
};

export type VisaoEquipe = {
  resumo: {
    atrasadas: number;
    hoje: number;
    proximas: number;
    negociacoesAbertas: number;
    semResponsavel: number;
    // Compromissos pendentes que não pertencem a nenhuma negociação e
    // portanto não têm dono objetivo. Zero em toda organização cujos
    // dados nasceram dos fluxos do produto — declarado em vez de
    // silenciosamente somado a alguém.
    semNegociacao: number;
  };
  membros: LinhaEquipe[];
  atrasadasDaEquipe: { total: number; itens: CompromissoEquipe[] };
};

type ContadoresBalde = { atrasadas: number; hoje: number; proximas: number };

const zerado = (): ContadoresBalde => ({ atrasadas: 0, hoje: 0, proximas: 0 });

export async function buscarVisaoEquipe(
  organizationId: string,
  // Fuso comercial da organização — obrigatório e sem padrão, mesma
  // convenção da Agenda e da Central pessoal.
  fuso: string,
  opcoes: { agora?: Date; limite?: number } = {}
): Promise<VisaoEquipe> {
  const agora = opcoes.agora ?? new Date();
  const limite = opcoes.limite ?? LIMITE_CENTRAL;
  const { inicio: inicioHoje, fim: fimHoje } = intervaloDoDia(agora, fuso);

  // Sem filtro de `type`: visita e follow-up contam igual (Fase 19).
  const baseAtividade = { organizationId, status: "SCHEDULED" as const };
  const baldes = {
    atrasadas: { scheduledAt: { lt: inicioHoje } },
    hoje: { scheduledAt: { gte: inicioHoje, lte: fimHoje } },
    proximas: { scheduledAt: { gt: fimHoje } },
  } as const;

  return withOrganization(organizationId, async () => {
    const [
      negociacoesPorResponsavel,
      grupoAtrasadas,
      grupoHoje,
      grupoProximas,
      totalAtrasadas,
      totalHoje,
      totalProximas,
      itensAtrasadas,
    ] = await Promise.all([
      // Agregação inteiramente no Postgres, inclusive o balde null.
      prisma.propertyInterest.groupBy({
        by: ["responsibleMemberId"],
        where: { organizationId, stage: { in: [...ESTAGIOS_INTERESSE] } },
        _count: { _all: true },
      }),
      prisma.scheduledActivity.groupBy({
        by: ["propertyInterestId"],
        where: { ...baseAtividade, ...baldes.atrasadas },
        _count: { _all: true },
      }),
      prisma.scheduledActivity.groupBy({
        by: ["propertyInterestId"],
        where: { ...baseAtividade, ...baldes.hoje },
        _count: { _all: true },
      }),
      prisma.scheduledActivity.groupBy({
        by: ["propertyInterestId"],
        where: { ...baseAtividade, ...baldes.proximas },
        _count: { _all: true },
      }),
      // Contagens EXATAS da ORGANIZAÇÃO, uma por balde. Nunca derivadas
      // do tamanho da lista truncada abaixo, e deliberadamente NÃO da
      // soma por membro: se existir atividade órfã (sem negociação), a
      // soma por pessoa é menor que o total da organização, e é o
      // `semNegociacao` que explica a diferença em vez de escondê-la.
      prisma.scheduledActivity.count({ where: { ...baseAtividade, ...baldes.atrasadas } }),
      prisma.scheduledActivity.count({ where: { ...baseAtividade, ...baldes.hoje } }),
      prisma.scheduledActivity.count({ where: { ...baseAtividade, ...baldes.proximas } }),
      prisma.scheduledActivity.findMany({
        where: { ...baseAtividade, ...baldes.atrasadas },
        // Mais antiga primeiro: é uma fila, igual à Central pessoal.
        orderBy: { scheduledAt: "asc" },
        take: limite,
        select: {
          id: true,
          type: true,
          subject: true,
          scheduledAt: true,
          notes: true,
          person: { select: { id: true, name: true, organizationId: true } },
          property: { select: { id: true, title: true, organizationId: true } },
          propertyInterest: {
            select: {
              organizationId: true,
              responsibleMember: {
                select: { id: true, status: true, organizationId: true, user: { select: { name: true } } },
              },
            },
          },
        },
      }),
    ]);

    // Negociações que têm compromisso pendente em qualquer balde. É este
    // conjunto — e não o de atividades — que atravessa para a memória.
    const idsNegociacoes = [
      ...new Set(
        [...grupoAtrasadas, ...grupoHoje, ...grupoProximas]
          .map((l) => l.propertyInterestId)
          .filter((id): id is string => id !== null)
      ),
    ];

    const donos = idsNegociacoes.length
      ? await prisma.propertyInterest.findMany({
          where: { organizationId, id: { in: idsNegociacoes } },
          select: { id: true, responsibleMemberId: true },
        })
      : [];
    const responsavelDaNegociacao = new Map(donos.map((d) => [d.id, d.responsibleMemberId]));

    // Dobra os três baldes por membro. `null` como chave é o balde "sem
    // responsável"; uma atividade sem negociação (propertyInterestId
    // null) NÃO entra aqui — é contada separadamente.
    const porMembro = new Map<string | null, ContadoresBalde>();
    let semNegociacao = 0;
    const acumular = (
      grupo: { propertyInterestId: string | null; _count: { _all: number } }[],
      balde: keyof ContadoresBalde
    ) => {
      for (const linha of grupo) {
        if (linha.propertyInterestId === null) {
          semNegociacao += linha._count._all;
          continue;
        }
        // Negociação de outro tenant não casaria o findMany acima; sem
        // dono conhecido, a atividade não é atribuída a ninguém.
        if (!responsavelDaNegociacao.has(linha.propertyInterestId)) continue;
        const chave = responsavelDaNegociacao.get(linha.propertyInterestId) ?? null;
        const atual = porMembro.get(chave) ?? zerado();
        atual[balde] += linha._count._all;
        porMembro.set(chave, atual);
      }
    };
    acumular(grupoAtrasadas, "atrasadas");
    acumular(grupoHoje, "hoje");
    acumular(grupoProximas, "proximas");

    const negociacoesPorMembro = new Map<string | null, number>(
      negociacoesPorResponsavel.map((l) => [l.responsibleMemberId, l._count._all])
    );

    // Nomes e status: UMA consulta para todos os membros que aparecem em
    // qualquer um dos agregados.
    const idsMembros = [
      ...new Set(
        [...porMembro.keys(), ...negociacoesPorMembro.keys()].filter(
          (id): id is string => id !== null
        )
      ),
    ];
    const membros = idsMembros.length
      ? await prisma.organizationMember.findMany({
          where: { organizationId, id: { in: idsMembros } },
          select: { id: true, status: true, user: { select: { name: true } } },
        })
      : [];
    const dadosMembro = new Map(membros.map((m) => [m.id, m]));

    const linhas: LinhaEquipe[] = [...new Set([...porMembro.keys(), ...negociacoesPorMembro.keys()])]
      .map((chave) => {
        const contadores = porMembro.get(chave) ?? zerado();
        const membro = chave === null ? null : dadosMembro.get(chave);
        return {
          memberId: chave,
          nome:
            chave === null
              ? SEM_RESPONSAVEL_LABEL
              : membro?.user.name?.trim() || "Membro sem nome",
          // Trabalho aberto atribuído a membro suspenso CONTINUA visível:
          // esconder seria pior que mostrar — ninguém o assumiria.
          inativo: membro ? !membroPodeReceberNegociacao(membro.status) : false,
          negociacoesAbertas: negociacoesPorMembro.get(chave) ?? 0,
          ...contadores,
        };
      })
      // ALFABÉTICA, nunca por número de atrasos: ordenar pessoas por
      // pendência transformaria a lista num ranking, que é exatamente o
      // que esta visão não é. "Sem responsável" fica por último porque
      // não é uma pessoa (mesma convenção do Analytics da Fase 11).
      .sort((a, b) => {
        if ((a.memberId === null) !== (b.memberId === null)) return a.memberId === null ? 1 : -1;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });

    return {
      resumo: {
        atrasadas: totalAtrasadas,
        hoje: totalHoje,
        proximas: totalProximas,
        negociacoesAbertas: linhas.reduce((t, l) => t + l.negociacoesAbertas, 0),
        semResponsavel: negociacoesPorMembro.get(null) ?? 0,
        semNegociacao,
      },
      membros: linhas,
      atrasadasDaEquipe: {
        total: totalAtrasadas,
        itens: itensAtrasadas.map((linha) => ({
          ...paraCompromisso(linha, organizationId),
          responsavel:
            linha.propertyInterest?.organizationId === organizationId &&
            linha.propertyInterest.responsibleMember &&
            linha.propertyInterest.responsibleMember.organizationId === organizationId
              ? {
                  nome:
                    linha.propertyInterest.responsibleMember.user.name?.trim() ||
                    "Membro sem nome",
                  inativo: !membroPodeReceberNegociacao(
                    linha.propertyInterest.responsibleMember.status
                  ),
                }
              : null,
        })),
      },
    };
  });
}

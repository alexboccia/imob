import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { agregarValorFechado, decimalParaValor } from "@/lib/valor-fechamento";
import {
  resolverJanelasAnalytics,
  compararComPeriodoAnterior,
  PERIODO_ANALYTICS_PADRAO,
  type PeriodoAnalytics,
  type JanelasAnalytics,
  type ComparacaoPeriodo,
} from "@/lib/analytics-comercial";

// =======================================================================
// Analytics da MINHA CARTEIRA (Fase 23)
// =======================================================================
// A Fase 22 deixou uma lacuna: em modo RESTRICTED, um corretor via os
// agregados da organização inteira no Analytics. Fechá-la NÃO é filtrar
// as consultas existentes por responsibleMemberId — é a resposta errada,
// e a auditoria mostra por quê.
//
// -----------------------------------------------------------------------
// O QUE O ANALYTICS ORGANIZACIONAL MEDE (e por que quase nada é pessoal)
// -----------------------------------------------------------------------
// Das 11 seções da tela, a origem dos dados é:
//
//   Interaction        contatos, pessoas distintas, imóveis com contato,
//                      série, origens, top imóveis, aquisição (UTM),
//                      proprietários anunciando
//   AnalyticsEvent     funil digital (PROPERTY_VIEW, WHATSAPP_CLICK)
//   PropertyInterest   resultado comercial, responsáveis, participação
//   Payment            liquidação
//
// `Interaction.memberId` é AUTOR (Fase 15), não dono — e a esmagadora
// maioria das interações nasce do site público com memberId null. Um
// contato recebido pela imobiliária não pertence a ninguém até alguém
// conduzir uma negociação. `AnalyticsEvent` não tem campo de membro
// nenhum: uma visualização de imóvel não vira "minha" porque o imóvel
// está sob minha responsabilidade hoje. UTM e referrer são atribuição de
// AQUISIÇÃO, da organização.
//
// Ou seja: filtrar essas métricas por membro produziria números
// aritmeticamente corretos e semanticamente falsos. É melhor não
// mostrá-las do que mostrá-las mentindo.
//
// -----------------------------------------------------------------------
// O QUE SOBRA, E É DE VERDADE
// -----------------------------------------------------------------------
// Só duas dimensões têm posse real, e elas são DIFERENTES entre si:
//
//   PropertyInterest.responsibleMemberId  quem conduz a negociação
//   PropertyInterestParticipant.memberId  quem é BENEFICIÁRIO da comissão
//
// Não são a mesma coisa (Fase 12): participar da comissão não é conduzir
// a negociação, e conduzir não garante participação.
//
// -----------------------------------------------------------------------
// OWNERSHIP HISTÓRICO NÃO EXISTE — e não é inventado aqui
// -----------------------------------------------------------------------
// O banco guarda o responsável ATUAL. Não há dimensão de "quem era o
// responsável entre X e Y": StageHistory registra o ator da transição de
// ETAPA (Fase 14), não do responsável, e o ActivityLog de
// `property_interest_reassigned` é trilha de auditoria, sem intervalos e
// sem cobrir as negociações anteriores à Fase 11 (que não teve backfill).
//
// Portanto, se Ana conduziu uma negociação por três meses e ela foi
// transferida para Bruno ontem, o fechamento aparece para BRUNO. Isso é
// uma limitação REAL do dado, e a tela diz exatamente isso: estas são as
// "negociações atualmente sob sua responsabilidade", nunca "resultados
// que você produziu". Reconstruir a atribuição histórica por inferência
// seria fabricar um fato.
// =======================================================================

export type NegociacoesDaCarteira = {
  // Criadas no período (createdAt) e hoje sob minha responsabilidade.
  criadas: ComparacaoPeriodo;
  // Encerradas no período (closedAt) e hoje sob minha responsabilidade.
  ganhas: number;
  perdidas: number;
  // Σ closedValue das ganhas. `semValor` é quantas ganhas não têm valor
  // registrado — nunca somadas como zero (Fase 9).
  valorFechado: number;
  ganhasSemValor: number;
  // Em andamento AGORA (não é recorte de período): é o estoque da
  // carteira, e por isso não tem comparação com período anterior.
  emAndamento: number;
};

export type MinhaParticipacao = {
  // Σ allocationValue das minhas participações em negociações ganhas no
  // período. null nas linhas sem valor atribuído nunca vira zero.
  atribuido: number;
  negociacoes: number;
  semValorAtribuido: number;
  // Σ dos pagamentos VÁLIDOS recebidos por mim no período (paidAt), com
  // cancelados fora — mesma regra da Fase 13.
  recebido: number;
  pagamentos: number;
};

export type AnalyticsCarteira = {
  periodo: PeriodoAnalytics;
  janelas: JanelasAnalytics;
  negociacoes: NegociacoesDaCarteira;
  participacao: MinhaParticipacao;
};

export async function buscarAnalyticsCarteira(
  organizationId: string,
  memberId: string,
  // Fuso comercial da organização (Fase 18) — os períodos continuam
  // sendo dias de calendário DA ORGANIZAÇÃO, idênticos aos da visão
  // organizacional. Escopo pessoal não muda o calendário.
  fuso: string,
  opcoes: { periodo?: PeriodoAnalytics; agora?: Date } = {}
): Promise<AnalyticsCarteira> {
  const periodo = opcoes.periodo ?? PERIODO_ANALYTICS_PADRAO;
  const janelas = resolverJanelasAnalytics(periodo, fuso, opcoes.agora ?? new Date());

  // O predicado de posse, em um lugar só. Vai na QUERY, nunca num filtro
  // em memória: dado fora do escopo não sai do banco.
  const minhas = { organizationId, responsibleMemberId: memberId };

  return withOrganization(organizationId, async () => {
    const [
      criadasAtual,
      criadasAnterior,
      encerradas,
      emAndamento,
      minhasParticipacoes,
      meusPagamentos,
    ] = await Promise.all([
      prisma.propertyInterest.count({
        where: { ...minhas, createdAt: { gte: janelas.atual.inicio, lte: janelas.atual.fim } },
      }),
      // Período anterior com o MESMO escopo — comparar "minha carteira
      // agora" com "a organização antes" seria pior que não comparar.
      prisma.propertyInterest.count({
        where: {
          ...minhas,
          createdAt: { gte: janelas.anterior.inicio, lte: janelas.anterior.fim },
        },
      }),
      prisma.propertyInterest.findMany({
        where: {
          ...minhas,
          closedAt: { gte: janelas.atual.inicio, lte: janelas.atual.fim },
          stage: { in: ["WON", "REJECTED"] },
        },
        select: { stage: true, closedValue: true },
      }),
      prisma.propertyInterest.count({
        where: { ...minhas, stage: { in: ["INTERESTED", "VISIT_SCHEDULED", "VISITED", "PROPOSAL"] } },
      }),
      // BENEFICIÁRIO, não responsável: o predicado aqui é
      // participant.memberId, uma dimensão diferente da de cima. A
      // coorte é a mesma da visão organizacional — negociações FECHADAS
      // no período (closedAt).
      prisma.propertyInterestParticipant.findMany({
        where: {
          organizationId,
          memberId,
          propertyInterest: {
            is: {
              organizationId,
              stage: "WON",
              closedAt: { gte: janelas.atual.inicio, lte: janelas.atual.fim },
            },
          },
        },
        select: { allocationValue: true },
      }),
      // Recebimentos: pagamentos cujo BENEFICIÁRIO sou eu, no período
      // (paidAt). Cancelados fora, como manda a Fase 13.
      prisma.propertyInterestParticipantPayment.findMany({
        where: {
          organizationId,
          cancelledAt: null,
          paidAt: { gte: janelas.atual.inicio, lte: janelas.atual.fim },
          participant: { is: { organizationId, memberId } },
        },
        select: { amount: true },
      }),
    ]);

    const ganhas = encerradas.filter((e) => e.stage === "WON");
    const agregado = agregarValorFechado(
      ganhas.map((g) => ({ closedValue: decimalParaValor(g.closedValue) }))
    );

    let atribuido = 0;
    let semValorAtribuido = 0;
    for (const participacao of minhasParticipacoes) {
      const valor = decimalParaValor(participacao.allocationValue);
      // null = participação sem valor atribuído. NUNCA somada como zero:
      // "não atribuído" e "atribuído R$ 0" são fatos diferentes.
      if (valor === null) semValorAtribuido += 1;
      else atribuido += valor;
    }

    const recebido = meusPagamentos.reduce(
      (soma, pagamento) => soma + (decimalParaValor(pagamento.amount) ?? 0),
      0
    );

    return {
      periodo,
      janelas,
      negociacoes: {
        criadas: compararComPeriodoAnterior(criadasAtual, criadasAnterior),
        ganhas: ganhas.length,
        perdidas: encerradas.length - ganhas.length,
        valorFechado: agregado.total,
        ganhasSemValor: agregado.ganhosSemValor,
        emAndamento,
      },
      participacao: {
        // Centavos: somar floats de 2 casas acumula erro binário, mesma
        // precaução de agregarValorFechado.
        atribuido: Math.round(atribuido * 100) / 100,
        negociacoes: minhasParticipacoes.length,
        semValorAtribuido,
        recebido: Math.round(recebido * 100) / 100,
        pagamentos: meusPagamentos.length,
      },
    };
  });
}

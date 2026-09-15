import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { decimalParaValor } from "@/lib/valor-fechamento";
import {
  resumirLiquidacao,
  type LiquidacaoParticipante,
  type StatusLiquidacao,
} from "@/lib/pagamento-comissao";

// =======================================================================
// Comissão a receber — a carteira financeira do corretor (Fase 35)
// =======================================================================
// A cadeia financeira já estava inteira no domínio antes desta fase:
//
//   PropertyInterest.commissionValue          comissão DO NEGÓCIO   (F10)
//   PropertyInterestParticipant.allocationValue  parcela de um membro (F12)
//   PropertyInterestParticipantPayment.amount    pagamento realizado  (F13)
//
// E o beneficiário nunca precisou ser inferido: o pagamento aponta para
// `participantId`, e a participação aponta para `memberId`. Quem recebeu
// é uma leitura de FK, não um rateio — por isso esta fase não inventa
// distribuição nenhuma e não precisou de migration.
//
// O QUE FALTAVA: a pergunta "quanto ainda tenho para receber, somando
// todos os meus negócios" não tinha dono. O saldo por PARCELA já existe
// na ficha do cliente (DivisaoComissao, via resumirLiquidacao); o
// Analytics mede FLUXO por período e recusa deliberadamente mostrar
// saldo (ver o cabeçalho de pagamento-comissao.ts). Este módulo é o
// agregado que faltava — e usa exatamente a mesma função de cálculo da
// ficha, para que os dois lugares nunca divirjam.
//
// -----------------------------------------------------------------------
// ESTOQUE, NÃO FLUXO — e por que não há filtro de período
// -----------------------------------------------------------------------
// "Recebi R$ 8.000 em setembro" é uma coorte por paidAt. "Ainda tenho
// R$ 15.000 a receber" é um SALDO, que não pertence a mês nenhum: o
// negócio pode ter fechado em agosto e ser pago em novembro. Misturar as
// duas naturezas num recorte mensal produziria um saldo que muda quando
// se troca o filtro, que é a definição de número em que não se confia.
// Por isso esta leitura não aceita janela temporal.
//
// -----------------------------------------------------------------------
// NEGÓCIOS ELEGÍVEIS: só WON
// -----------------------------------------------------------------------
// Não por hipótese: registrar pagamento é bloqueado fora de WON
// (registrarPagamentoParticipante recusa `stage !== "WON"`), então um
// negócio aberto nunca tem recebido — e contar a parcela dele como "a
// receber" afirmaria uma comissão que ainda não foi ganha. Negócio
// perdido idem: participação residual não vira crédito.
// =======================================================================

export type NegocioDaComissao = {
  participacaoId: string;
  negociacaoId: string;
  pessoaId: string;
  pessoaNome: string;
  imovelId: string;
  imovelTitulo: string;
  closedAtISO: string | null;
  // Contexto, não parcela: o valor do negócio e a comissão TOTAL dele.
  // Nunca confundir com `liquidacao.atribuido`, que é só a minha parte.
  closedValue: number | null;
  comissaoDoNegocio: number | null;
  // atribuido / pago / pendente / status — calculados por
  // resumirLiquidacao, a MESMA função que a ficha do cliente usa.
  liquidacao: LiquidacaoParticipante;
  // pendente com piso em zero, para exibição. Ver `saldoAReceber`.
  aReceber: number | null;
};

export type CarteiraComissao = {
  totalAtribuido: number;
  totalRecebido: number;
  totalAReceber: number;
  // Participações minhas em negócios ganhos cujo valor ninguém definiu.
  // NUNCA somadas como zero: "não atribuído" e "atribuído R$ 0" são
  // fatos diferentes, e em dinheiro essa diferença importa.
  semValorAtribuido: number;
  negocios: NegocioDaComissao[];
};

// -----------------------------------------------------------------------
// Piso de exibição, em UM lugar só
// -----------------------------------------------------------------------
// `resumirLiquidacao` devolve a subtração honesta, que é o que a ficha
// do cliente precisa. Aqui a pergunta é outra — "quanto falta receber" —
// e "-R$ 500" não é uma resposta: não existe dívida negativa no domínio,
// e o produto não tem crédito, adiantamento nem excedente para nomear o
// que sobrou. Então o saldo tem piso zero e o RECEBIDO permanece o valor
// verdadeiro, sem nada ser subtraído dele.
//
// Hoje isso é inalcançável: validarPagamentoContraAtribuicao recusa
// pagamento acima da parcela e validarAtribuicaoContraPagamentos recusa
// baixar a parcela abaixo do já pago (as duas provadas em teste de
// integração). O piso existe porque uma leitura financeira não deve
// depender de uma invariante de escrita continuar valendo para sempre.
export function saldoAReceber(liquidacao: LiquidacaoParticipante): number | null {
  if (liquidacao.pendente === null) return null;
  return Math.max(liquidacao.pendente, 0);
}

export const STATUS_A_RECEBER_LABEL: Record<StatusLiquidacao, string> = {
  SEM_VALOR: "Participação sem valor definido",
  PENDENTE: "A receber",
  PARCIAL: "Parcialmente recebido",
  LIQUIDADO: "Recebido",
};

const centavos = (n: number) => Math.round(n * 100) / 100;

// Ordem determinística e útil: primeiro o que ainda rende dinheiro, por
// último o que já está encerrado. Dentro de cada grupo, fechamento mais
// recente primeiro; empate (ou closedAt ausente) desempata pelo id da
// participação, para a lista nunca trocar de ordem entre dois carregamentos.
//
// "Sem valor definido" vem antes de "Recebido" de propósito: é assunto
// pendente — alguém precisa declarar a parcela — e não um negócio
// concluído.
const PESO_GRUPO: Record<StatusLiquidacao, number> = {
  PENDENTE: 0,
  PARCIAL: 0,
  SEM_VALOR: 1,
  LIQUIDADO: 2,
};

export function ordenarNegocios(negocios: NegocioDaComissao[]): NegocioDaComissao[] {
  return [...negocios].sort((a, b) => {
    const grupo = PESO_GRUPO[a.liquidacao.status] - PESO_GRUPO[b.liquidacao.status];
    if (grupo !== 0) return grupo;
    const dataA = a.closedAtISO ?? "";
    const dataB = b.closedAtISO ?? "";
    if (dataA !== dataB) return dataB.localeCompare(dataA);
    return a.participacaoId.localeCompare(b.participacaoId);
  });
}

// Agregação pura, separada da consulta — é ela que os testes unitários
// exercitam sem banco.
export function resumirCarteira(negocios: NegocioDaComissao[]): CarteiraComissao {
  let totalAtribuido = 0;
  let totalRecebido = 0;
  let totalAReceber = 0;
  let semValorAtribuido = 0;

  for (const negocio of negocios) {
    if (negocio.liquidacao.atribuido === null) semValorAtribuido += 1;
    else totalAtribuido += negocio.liquidacao.atribuido;
    totalRecebido += negocio.liquidacao.pago;
    // Piso aplicado por LINHA, nunca sobre o total: se um dia existisse
    // um negócio pago a mais, o excedente dele não pode abater o saldo
    // legítimo de outro negócio.
    totalAReceber += negocio.aReceber ?? 0;
  }

  return {
    totalAtribuido: centavos(totalAtribuido),
    totalRecebido: centavos(totalRecebido),
    totalAReceber: centavos(totalAReceber),
    semValorAtribuido,
    negocios: ordenarNegocios(negocios),
  };
}

// -----------------------------------------------------------------------
// Leitura
// -----------------------------------------------------------------------
// ESCOPO NA QUERY, nunca em memória: `memberId` é o predicado de posse
// financeira e vai no WHERE junto com organizationId. Participação de
// colega não sai do banco — não é escondida depois.
//
// `memberId` vem SEMPRE da sessão do servidor (o vínculo do usuário com
// esta organização), jamais da URL: não há id de membro navegável, então
// não há IDOR a explorar aqui.
//
// BENEFICIÁRIO, NÃO RESPONSÁVEL: o predicado é participant.memberId.
// `PropertyInterest.responsibleMemberId` é quem CONDUZ a negociação e não
// diz nada sobre dinheiro (Fase 12) — usá-lo aqui atribuiria comissão a
// quem ninguém declarou beneficiário.
export async function buscarComissaoAReceber(
  organizationId: string,
  memberId: string
): Promise<CarteiraComissao> {
  return withOrganization(organizationId, async () => {
    const participacoes = await prisma.propertyInterestParticipant.findMany({
      where: {
        organizationId,
        memberId,
        propertyInterest: { is: { organizationId, stage: "WON" } },
      },
      select: {
        id: true,
        allocationValue: true,
        propertyInterest: {
          select: {
            id: true,
            closedAt: true,
            closedValue: true,
            commissionValue: true,
            person: { select: { id: true, name: true } },
            property: { select: { id: true, title: true } },
          },
        },
        // PAGAMENTO VÁLIDO = não cancelado, a mesma definição da Fase 13.
        // Filtrado na QUERY: cancelado não é escondido na soma, ele não
        // chega. organizationId repetido aqui é a defesa em profundidade
        // já usada no resto do projeto — a FK sozinha nunca é o isolamento.
        payments: {
          where: { organizationId, cancelledAt: null },
          select: { amount: true },
        },
      },
    });

    const negocios = participacoes.map((participacao) => {
      const liquidacao = resumirLiquidacao(
        decimalParaValor(participacao.allocationValue),
        participacao.payments.map((pagamento) => decimalParaValor(pagamento.amount) ?? 0)
      );
      return {
        participacaoId: participacao.id,
        negociacaoId: participacao.propertyInterest.id,
        pessoaId: participacao.propertyInterest.person.id,
        pessoaNome: participacao.propertyInterest.person.name,
        imovelId: participacao.propertyInterest.property.id,
        imovelTitulo: participacao.propertyInterest.property.title,
        closedAtISO: participacao.propertyInterest.closedAt?.toISOString() ?? null,
        closedValue: decimalParaValor(participacao.propertyInterest.closedValue),
        comissaoDoNegocio: decimalParaValor(participacao.propertyInterest.commissionValue),
        liquidacao,
        aReceber: saldoAReceber(liquidacao),
      };
    });

    return resumirCarteira(negocios);
  });
}

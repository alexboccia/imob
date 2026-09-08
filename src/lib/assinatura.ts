import type { SubscriptionStatus } from "@/generated/prisma/client";

// =======================================================================
// Assinatura: significado dos estados (Fase 27)
// =======================================================================
// Escrito sobre o enum REAL (SubscriptionStatus), não sobre um desenho
// ideal: TRIALING, ACTIVE, PAST_DUE e CANCELED já existem no schema
// desde a Fase P.9. Nenhum estado novo é criado aqui — criar um sexto
// estado sem um evento que o produza seria inventar domínio.
//
// O QUE A AUDITORIA ENCONTROU, e que este módulo registra em código:
//
//   TRIALING  — ÚNICO estado escrito hoje. Nasce no bootstrap da
//               organização (self-service e Super Admin) quando o plano
//               é de trial. O período vive em currentPeriodStart/End.
//   ACTIVE    — nenhum writer. O produto NUNCA marca uma assinatura como
//               ativa: hoje a "conversão" acontece pela troca de PLANO
//               feita pelo Super Admin (alterarPlano), e é o
//               `plan.isTrial = false` que destrava a operação — não o
//               status da Subscription.
//   PAST_DUE  — nenhum writer, nenhum leitor. Não existe cobrança.
//   CANCELED  — nenhum writer, nenhum leitor.
//
// Ou seja: metade do enum é vocabulário preparatório. Este módulo não
// finge o contrário; ele nomeia o que cada estado significa e declara
// quais transições um provedor de pagamento poderá produzir quando
// existir — sem executá-las.

export type EstadoAssinatura = {
  status: SubscriptionStatus;
  rotulo: string;
  descricao: string;
  // true quando o estado, sozinho, permite operar. Hoje NENHUM estado
  // decide isso: quem decide é plan.isTrial + período (ver
  // resolverEstadoAcesso em entitlements.ts). A propriedade existe para
  // o dia em que a decisão migrar para a assinatura — e está marcada
  // como não-autoritativa de propósito.
  operacaoLiberadaPeloStatus: boolean;
};

export const ESTADOS_ASSINATURA: Record<SubscriptionStatus, EstadoAssinatura> = {
  TRIALING: {
    status: "TRIALING",
    rotulo: "Período de avaliação",
    descricao:
      "A organização está usando o produto por tempo determinado, sem contrato pago.",
    operacaoLiberadaPeloStatus: true,
  },
  ACTIVE: {
    status: "ACTIVE",
    rotulo: "Assinatura ativa",
    descricao: "Contrato vigente entre a imobiliária e o easymob.",
    operacaoLiberadaPeloStatus: true,
  },
  PAST_DUE: {
    status: "PAST_DUE",
    rotulo: "Pagamento pendente",
    descricao:
      "Contrato existente com pagamento em aberto. Nenhum fluxo do produto produz este estado hoje.",
    operacaoLiberadaPeloStatus: false,
  },
  CANCELED: {
    status: "CANCELED",
    rotulo: "Assinatura encerrada",
    descricao:
      "Contrato encerrado. Nenhum fluxo do produto produz este estado hoje.",
    operacaoLiberadaPeloStatus: false,
  },
};

// TRANSIÇÕES POSSÍVEIS, e apenas as que um evento real poderia produzir.
// Declaradas aqui para que a chegada de um provedor de pagamento não
// precise redescobrir o desenho — e para que qualquer transição fora
// desta tabela apareça como decisão consciente, não como efeito
// colateral de um webhook mal mapeado.
//
// Note o que NÃO existe: nenhuma seta sai de CANCELED. Reativar uma
// assinatura encerrada é contratar de novo, e "contratar de novo" é uma
// decisão comercial que o repositório não define.
export const TRANSICOES_ASSINATURA: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIALING: ["ACTIVE", "CANCELED"],
  ACTIVE: ["PAST_DUE", "CANCELED"],
  PAST_DUE: ["ACTIVE", "CANCELED"],
  CANCELED: [],
};

export function transicaoPermitida(
  de: SubscriptionStatus,
  para: SubscriptionStatus
): boolean {
  // Transição para o MESMO estado é sempre permitida e sempre inócua: é
  // o que torna o reprocessamento de um evento idempotente em vez de
  // erro. Um provedor reenviando "pagamento confirmado" não pode
  // quebrar nada.
  if (de === para) return true;
  return TRANSICOES_ASSINATURA[de].includes(para);
}

// Dinheiro em CENTAVOS INTEIROS, sempre. Plan.priceMonthlyCents e
// Invoice.amountCents já são Int no schema — nenhum float participa de
// valor monetário em lugar nenhum deste domínio.
//
// A formatação acontece na borda, para exibição, e nunca volta para
// cálculo: o número que o produto guarda é o inteiro.
export function formatarPrecoMensal(
  centavos: number | null,
  moeda = "BRL"
): string | null {
  if (centavos === null) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda,
  }).format(centavos / 100);
}

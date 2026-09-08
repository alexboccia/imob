import { prisma } from "@/lib/prisma";
import { ESTADOS_ASSINATURA, formatarPrecoMensal } from "@/lib/assinatura";
import { getLimit, FEATURE_PROPERTIES, FEATURE_USERS, contarUsoAtual } from "@/lib/entitlements";
import type { SubscriptionStatus } from "@/generated/prisma/client";

// =======================================================================
// Estado financeiro da organização (Fase 27) — SOMENTE LEITURA
// =======================================================================
// Reúne, em um único DTO plano, o que uma imobiliária precisa saber
// sobre o próprio contrato. Nenhuma chamada externa: o enforcement e
// esta tela leem estado LOCAL, então uma indisponibilidade de provedor
// (quando houver um) nunca derruba a navegação nem esconde o plano.
//
// DTO plano por decisão da Fase 16: nenhum Prisma.Decimal e nenhum
// objeto do Prisma atravessa Server → Client. Datas viajam como ISO.

export type UsoLimite = {
  rotulo: string;
  usoAtual: number | null;
  limite: number | null;
};

export type AssinaturaOrganizacao = {
  nomePlano: string;
  codigoPlano: string;
  precoMensalFormatado: string | null;
  moeda: string;
  // null quando não existe Subscription — que é o caso de toda
  // organização em plano pago hoje (nenhum fluxo cria assinatura para
  // plano não-trial). Ausência é dita como ausência, nunca como ACTIVE.
  status: SubscriptionStatus | null;
  statusRotulo: string | null;
  statusDescricao: string | null;
  emTrial: boolean;
  trialTerminaEmISO: string | null;
  trialExpirado: boolean;
  limites: UsoLimite[];
};

// Moeda vem do domínio, nunca do browser. Hoje é uma constante: todo
// preço do catálogo é mensal em centavos e Invoice.currency já nasce
// "BRL" por default no schema.
const MOEDA_PADRAO = "BRL";

export async function buscarAssinaturaOrganizacao(
  organizationId: string,
  agora: Date = new Date()
): Promise<AssinaturaOrganizacao> {
  const organizacao = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      plan: { select: { code: true, name: true, priceMonthlyCents: true, isTrial: true } },
    },
  });

  // A assinatura mais recente da organização. Ordenada explicitamente:
  // "a primeira que o banco devolver" nunca é resposta para dado
  // financeiro.
  const assinatura = await prisma.subscription.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { status: true, currentPeriodEnd: true },
  });

  const [limiteImoveis, usoImoveis, limiteUsuarios, usoUsuarios] = await Promise.all([
    getLimit(organizationId, FEATURE_PROPERTIES),
    contarUsoAtual(organizationId, FEATURE_PROPERTIES),
    getLimit(organizationId, FEATURE_USERS),
    contarUsoAtual(organizationId, FEATURE_USERS),
  ]);

  const emTrial = organizacao.plan.isTrial;
  const trialTerminaEm = emTrial ? (assinatura?.currentPeriodEnd ?? null) : null;

  return {
    nomePlano: organizacao.plan.name,
    codigoPlano: organizacao.plan.code,
    precoMensalFormatado: formatarPrecoMensal(
      organizacao.plan.priceMonthlyCents,
      MOEDA_PADRAO
    ),
    moeda: MOEDA_PADRAO,
    status: assinatura?.status ?? null,
    statusRotulo: assinatura ? ESTADOS_ASSINATURA[assinatura.status].rotulo : null,
    statusDescricao: assinatura ? ESTADOS_ASSINATURA[assinatura.status].descricao : null,
    emTrial,
    trialTerminaEmISO: trialTerminaEm?.toISOString() ?? null,
    // Mesma regra fail-closed do enforcement (entitlements.ts): plano de
    // trial SEM período válido é tratado como expirado, nunca como
    // acesso livre. Esta tela nunca pode dizer "tudo certo" para uma
    // organização que o portão está bloqueando.
    trialExpirado: emTrial && (!trialTerminaEm || trialTerminaEm.getTime() <= agora.getTime()),
    limites: [
      { rotulo: "Imóveis ativos", usoAtual: usoImoveis, limite: limiteImoveis },
      { rotulo: "Usuários ativos", usoAtual: usoUsuarios, limite: limiteUsuarios },
    ],
  };
}

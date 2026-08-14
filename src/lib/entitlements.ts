import { cache } from "react";
import { prisma } from "@/lib/prisma";

// "Feature"s de limite conhecidas (strings livres no banco — PlanLimit.feature
// não é enum de propósito, pra permitir novos limites sem migration).
export const FEATURE_PROPERTIES = "PROPERTIES";
export const FEATURE_USERS = "USERS";
// Fase P.9.
export const FEATURE_PHOTOS_PER_PROPERTY = "PHOTOS_PER_PROPERTY";
export const FEATURE_CRM_CLIENTS = "CRM_CLIENTS";

const FEATURES_CONHECIDAS = [
  FEATURE_PROPERTIES,
  FEATURE_USERS,
  FEATURE_PHOTOS_PER_PROPERTY,
  FEATURE_CRM_CLIENTS,
] as const;

// Status de Property que contam como "ativo" pro limite de imóveis.
const STATUS_IMOVEL_ATIVO = ["DRAFT", "AVAILABLE", "RESERVED"] as const;

// Fase P.9: carrega Organization + Plan (com módulos/limites) + overrides
// da própria organização, tudo em UMA query batched — fonte única de
// dados pra tudo que depende de "configuração comercial efetiva" desta
// organização (preço, limites, trial, módulos). carregarPlano abaixo
// continua existindo só pra não obrigar hasModule/getLimit a mudar de
// forma, mas já deriva desta mesma query cacheada (cache() por request
// dedupe chamadas aninhadas, não gera query dobrada).
const carregarOrganizacaoComPlano = cache(async (organizationId: string) => {
  return prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: {
      plan: {
        include: {
          planModules: { include: { module: true } },
          planLimits: true,
        },
      },
      limitOverrides: true,
    },
  });
});

const carregarPlano = cache(async (organizationId: string) => {
  const organization = await carregarOrganizacaoComPlano(organizationId);
  return organization.plan;
});

// Lógica pura (sem Prisma) — testável sem banco de dados.

export function moduloHabilitado(
  planModules: { module: { code: string }; enabled: boolean }[],
  moduleCode: string
): boolean {
  const planModule = planModules.find((pm) => pm.module.code === moduleCode);
  return planModule?.enabled ?? false;
}

// null = sem limite (ilimitado, seja por config explícita ou por ausência
// de linha pra essa feature nesse plano).
export function limiteDoCatalogo(
  planLimits: { feature: string; limit: number | null }[],
  feature: string
): number | null {
  const planLimit = planLimits.find((l) => l.feature === feature);
  return planLimit?.limit ?? null;
}

// Fase P.9: override tem PRIORIDADE ABSOLUTA sobre o plano quando existe
// uma linha (organizationId, feature) — mesmo quando limit=null nessa
// linha (override explícito pra ilimitado). Nunca usar `??` direto sobre
// `override?.limit`: isso confundiria "override existe com limit=null"
// (ilimitado, intencional) com "não existe override" (herda do plano) —
// a distinção correta é a PRESENÇA da linha (`override` truthy/undefined),
// não o valor do campo `limit` dentro dela.
export function limiteEfetivoDoCatalogo(
  overrides: { feature: string; limit: number | null }[],
  planLimits: { feature: string; limit: number | null }[],
  feature: string
): number | null {
  const override = overrides.find((o) => o.feature === feature);
  if (override) return override.limit;
  return limiteDoCatalogo(planLimits, feature);
}

// Preço override não tem a mesma ambiguidade de limite (não existe
// "override explícito para null" com significado distinto de "sem
// override" — um preço null simplesmente não foi definido) — `??` é
// correto e suficiente aqui. 0 é um valor override válido (plano
// gratuito/cortesia), nunca tratado como "ausente".
export function precoEfetivoCents(
  priceMonthlyCentsOverride: number | null,
  planPriceMonthlyCents: number | null
): number | null {
  return priceMonthlyCentsOverride ?? planPriceMonthlyCents;
}

export function limiteExcedido(total: number, limite: number | null): boolean {
  if (limite === null) return false;
  return total >= limite;
}

// Diferente de limiteExcedido (que compara "total já existente ANTES de
// criar mais um" — semântica de imóveis/usuários, incremental
// count-then-create): o formulário de imóvel substitui a lista INTEIRA de
// mídias a cada save (ver atualizarImovel/criarImovel), então
// `quantidadeSubmetida` já é o total FINAL desejado — a comparação correta
// é estritamente `>` (não `>=`), senão uma submissão EXATAMENTE no limite
// seria rejeitada por engano.
export function limiteFotosExcedido(quantidadeSubmetida: number, limite: number | null): boolean {
  if (limite === null) return false;
  return quantidadeSubmetida > limite;
}

export async function hasModule(
  organizationId: string,
  moduleCode: string
): Promise<boolean> {
  const plano = await carregarPlano(organizationId);
  return moduloHabilitado(plano.planModules, moduleCode);
}

// Fase P.9: já override-aware — getLimit (e por consequência
// verificarLimiteImoveis/verificarLimiteUsuarios abaixo, que só chamam
// esta função) passam a respeitar OrganizationLimitOverride
// automaticamente, sem precisar mudar a lógica das duas.
export async function getLimit(
  organizationId: string,
  feature: string
): Promise<number | null> {
  const organization = await carregarOrganizacaoComPlano(organizationId);
  return limiteEfetivoDoCatalogo(organization.limitOverrides, organization.plan.planLimits, feature);
}

// Fase P.9: contagem de uso atual pras 3 features AGREGADAS por
// organização (usadas pelo guard de downgrade em alterarPlano,
// platform/organizations/[id]/actions.ts) — mesmas queries já usadas por
// verificarLimiteImoveis/verificarLimiteUsuarios, mas expostas aqui pra um
// consumidor que precisa do NÚMERO (não só "excedeu?"). PHOTOS_PER_PROPERTY
// é limite POR IMÓVEL, não um agregado único da organização — não tem
// "uso atual" nesse sentido, retorna null (nunca inventa um número).
export async function contarUsoAtual(organizationId: string, feature: string): Promise<number | null> {
  switch (feature) {
    case FEATURE_PROPERTIES:
      return prisma.property.count({
        where: { organizationId, status: { in: [...STATUS_IMOVEL_ATIVO] } },
      });
    case FEATURE_USERS:
      return prisma.organizationMember.count({ where: { organizationId, status: "ACTIVE" } });
    case FEATURE_CRM_CLIENTS:
      return prisma.person.count({ where: { organizationId } });
    default:
      return null;
  }
}

export class LimiteDoPlanoError extends Error {}

export async function verificarLimiteImoveis(organizationId: string): Promise<void> {
  const limite = await getLimit(organizationId, FEATURE_PROPERTIES);
  if (limite === null) return;

  const total = await prisma.property.count({
    where: { organizationId, status: { in: [...STATUS_IMOVEL_ATIVO] } },
  });
  if (limiteExcedido(total, limite)) {
    throw new LimiteDoPlanoError(
      `Seu plano permite até ${limite} imóveis ativos. Encerre ou remova um imóvel, ou faça upgrade de plano, para cadastrar um novo.`
    );
  }
}

export async function verificarLimiteUsuarios(organizationId: string): Promise<void> {
  const limite = await getLimit(organizationId, FEATURE_USERS);
  if (limite === null) return;

  const total = await prisma.organizationMember.count({
    where: { organizationId, status: "ACTIVE" },
  });
  if (limiteExcedido(total, limite)) {
    throw new LimiteDoPlanoError(
      `Seu plano permite até ${limite} usuários ativos. Desative um usuário ou faça upgrade de plano para cadastrar um novo.`
    );
  }
}

// Fase P.9: validação de FOTOS é síncrona/pura por design — chamada pelo
// caller (imoveis/actions.ts) ANTES de abrir a transação de replace de
// mídias, com a lista já em mãos (nunca uma query own daqui). organizationId
// só serve pra resolver o limite efetivo (plano + override); a posse
// tenant do Property em si continua sendo responsabilidade do caller (já
// garantida pelo where com organizationId explícito nas queries
// existentes de imoveis/actions.ts).
export async function verificarLimiteFotos(
  organizationId: string,
  quantidadeSubmetida: number
): Promise<void> {
  const limite = await getLimit(organizationId, FEATURE_PHOTOS_PER_PROPERTY);
  if (limiteFotosExcedido(quantidadeSubmetida, limite)) {
    throw new LimiteDoPlanoError(
      `Este plano permite até ${limite} fotos por imóvel. Remova alguma foto ou faça upgrade de plano.`
    );
  }
}

// Fase P.9: agregado de leitura pra exibição (Platform Admin) — preço e
// limites já resolvidos (override ?? plano), módulos habilitados, estado
// de trial do PLANO (não da organização — ver resolverEstadoAcessoOrganizacao
// abaixo pra saber se O TRIAL DESTA organização está ativo/expirado). Uma
// única query batched (mesma de getLimit/hasModule, cache() por request
// garante zero query duplicada mesmo chamando os três na mesma
// requisição).
export type EntitlementsOrganizacao = {
  planId: string;
  planCode: string;
  planName: string;
  priceMonthlyCentsPadrao: number | null;
  priceMonthlyCentsEfetivo: number | null;
  isTrial: boolean;
  trialDays: number | null;
  limites: Record<(typeof FEATURES_CONHECIDAS)[number], number | null>;
  modulosHabilitados: Set<string>;
};

export async function resolverEntitlementsOrganizacao(
  organizationId: string
): Promise<EntitlementsOrganizacao> {
  const organization = await carregarOrganizacaoComPlano(organizationId);
  const limites = Object.fromEntries(
    FEATURES_CONHECIDAS.map((feature) => [
      feature,
      limiteEfetivoDoCatalogo(organization.limitOverrides, organization.plan.planLimits, feature),
    ])
  ) as EntitlementsOrganizacao["limites"];

  return {
    planId: organization.plan.id,
    planCode: organization.plan.code,
    planName: organization.plan.name,
    priceMonthlyCentsPadrao: organization.plan.priceMonthlyCents,
    priceMonthlyCentsEfetivo: precoEfetivoCents(
      organization.priceMonthlyCentsOverride,
      organization.plan.priceMonthlyCents
    ),
    isTrial: organization.plan.isTrial,
    trialDays: organization.plan.trialDays,
    limites,
    modulosHabilitados: new Set(
      organization.plan.planModules.filter((pm) => pm.enabled).map((pm) => pm.module.code)
    ),
  };
}

// -----------------------------------------------------------------------
// Trial (Fase P.9) — Subscription é a ÚNICA fonte do período real de
// trial de uma organização (status TRIALING, currentPeriodStart/End).
// Plan.trialDays é só a duração PADRÃO usada ao CRIAR o trial (ver
// organizations/nova/actions.ts) — nunca recalculada a partir de
// organization.createdAt, justamente pra permitir extensão individual
// (Platform Admin) sem tocar no plano. Organização em plano pago
// (plan.isTrial=false) nunca é bloqueada por trial, mesmo que exista uma
// Subscription TRIALING antiga (histórico preservado, nunca apagado —
// ver alterarPlano em platform/organizations/[id]/actions.ts).
// -----------------------------------------------------------------------

type StatusAcessoOrganizacao = { active: boolean; isTrial: boolean; trialEndsAt: Date | null };

const carregarStatusAcessoOrganizacao = cache(
  async (organizationId: string): Promise<StatusAcessoOrganizacao> => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { active: true, plan: { select: { isTrial: true } } },
    });
    if (!organization.plan.isTrial) {
      return { active: organization.active, isTrial: false, trialEndsAt: null };
    }
    // Mais de uma Subscription TRIALING pra mesma organização nunca deveria
    // acontecer (nenhum fluxo desta fase cria uma segunda), mas o
    // desempate por createdAt desc é defensivo — nunca confia em "a
    // primeira que o banco retornar".
    const trial = await prisma.subscription.findFirst({
      where: { organizationId, status: "TRIALING" },
      orderBy: { createdAt: "desc" },
      select: { currentPeriodEnd: true },
    });
    return { active: organization.active, isTrial: true, trialEndsAt: trial?.currentPeriodEnd ?? null };
  }
);

export type EstadoAcessoOrganizacao =
  | { bloqueado: false }
  | { bloqueado: true; motivo: "SUSPENSA" }
  // trialEndsAtISO null = trial sem período válido (sem Subscription, ou
  // Subscription sem currentPeriodEnd) — nunca confundido com "sem dado
  // logo libera": um plano trial SEMPRE exige um período válido pra
  // operar, ausência de dado é tratada como bloqueio, nunca como acesso
  // livre (ver comentário de resolverEstadoAcesso abaixo).
  | { bloqueado: true; motivo: "TRIAL_EXPIRADO"; trialEndsAtISO: string | null };

// Pura — testável sem banco. `agora` sempre parâmetro explícito (mesmo
// racional já estabelecido em todo o projeto: calcularAgingStageMs,
// classificarPrioridadePipeline etc). Precedência: SUSPENSA > TRIAL_EXPIRADO.
// Plano pago (isTrial=false) NUNCA é bloqueado por trial, mesmo com uma
// Subscription TRIALING histórica antiga (preservada como registro
// factual, nunca apagada — ver alterarPlano).
//
// Fail-closed (correção pós-auditoria, achado MEDIUM): um Plan com
// isTrial=true SEMPRE exige um período de trial válido pra que a
// organização opere — ausência de Subscription, ou Subscription sem
// currentPeriodEnd, é tratada como TRIAL_EXPIRADO (bloqueado), nunca como
// acesso liberado. Isso é uma exceção deliberada ao princípio geral do
// projeto de "nunca inventar/bloquear por ausência de dado" (ex:
// aging indisponível em P.6): aqui a ausência de dado é, ela mesma, a
// condição de bloqueio — um plano que PROMETE ser temporário (isTrial)
// nunca pode virar acesso permanente só porque o registro do período
// nunca foi criado ou ficou inconsistente. `alterarPlano`
// (organizations/[id]/actions.ts) garante atomicamente que mover uma
// organização pra um plano trial sempre cria/reaproveita um período
// válido — este fail-closed é a segunda camada de defesa, não a única.
export function resolverEstadoAcesso(
  status: StatusAcessoOrganizacao,
  agora: Date
): EstadoAcessoOrganizacao {
  if (!status.active) return { bloqueado: true, motivo: "SUSPENSA" };
  if (!status.isTrial) return { bloqueado: false };
  if (status.trialEndsAt === null) {
    return { bloqueado: true, motivo: "TRIAL_EXPIRADO", trialEndsAtISO: null };
  }
  if (agora.getTime() > status.trialEndsAt.getTime()) {
    return { bloqueado: true, motivo: "TRIAL_EXPIRADO", trialEndsAtISO: status.trialEndsAt.toISOString() };
  }
  return { bloqueado: false };
}

export async function resolverEstadoAcessoOrganizacao(
  organizationId: string,
  agora: Date = new Date()
): Promise<EstadoAcessoOrganizacao> {
  const status = await carregarStatusAcessoOrganizacao(organizationId);
  return resolverEstadoAcesso(status, agora);
}

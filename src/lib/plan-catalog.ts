// Fase 122-B (AUD-121-005) — fonte única de verdade para o catálogo de
// módulos e para a configuração "V1 aprovada" dos planos comerciais
// BASICO/PRO/PREMIUM (preço, módulos habilitados, limites).
//
// Antes desta fase existiam DOIS literais independentes com os mesmos
// dados — prisma/seed.ts (criação) e scripts/reconciliar-planos-p9.ts
// (correção pontual one-time) — e eles haviam divergido de fato: o PRO
// do seed.ts inclui "custom-domain" (adicionado na Fase P.10), mas o PRO
// de reconciliar-planos-p9.ts não foi atualizado quando esse módulo
// nasceu. Reexecutar o script de reconciliação depois do seed.ts
// desabilitaria silenciosamente o domínio próprio do PRO, sem que
// nenhuma migration ou code review avisasse — exatamente o tipo de
// divergência "duas fontes de verdade" que a Fase 121 (AUD-121-005)
// pediu para eliminar.
//
// Esta extração NÃO muda nenhum comportamento comercial vigente: os
// valores abaixo são EXATAMENTE os que já estavam no seed.ts (a fonte
// mais completa e mais recentemente atualizada), só centralizados para
// que os dois scripts nunca mais possam divergir entre si.
//
// Os preços/limites PROPOSTOS em estudo na Fase 121/122 (R$99/199/349,
// 150/500/1500 imóveis etc.) NÃO estão aqui — continuam fora de
// qualquer automação até aprovação comercial explícita (ver
// docs/tecnico/fase-122-correcoes/06-PLANOS-COMERCIAIS.md).

export const CATALOGO_MODULOS: { code: string; name: string }[] = [
  { code: "core", name: "Core" },
  { code: "properties", name: "Imóveis" },
  { code: "crm", name: "CRM" },
  { code: "leads", name: "Leads" },
  { code: "pipeline", name: "Funil" },
  { code: "agenda", name: "Agenda" },
  { code: "financeiro", name: "Financeiro" },
  { code: "marketing", name: "Marketing" },
  { code: "ia", name: "Inteligência Artificial" },
  { code: "relatorios", name: "Relatórios" },
  { code: "integracoes", name: "Integrações" },
  { code: "billing", name: "Cobrança" },
  { code: "email", name: "Envio de e-mail" },
  { code: "portais", name: "Publicação em portais" },
  { code: "whatsapp", name: "WhatsApp" },
  // Fase P.10.
  { code: "custom-domain", name: "Domínio próprio" },
  { code: "email-domain", name: "E-mail com domínio próprio" },
];

export type PlanoCatalogoConfig = {
  code: string;
  name: string;
  priceMonthlyCents: number;
  isTrial: boolean;
  trialDays: number | null;
  // "TODOS" = todos os módulos de CATALOGO_MODULOS, sem lista fixa (é o
  // caso do PREMIUM — nunca precisa de edição quando um módulo novo
  // nasce no catálogo).
  modulosHabilitados: string[] | "TODOS";
  limites: Record<string, number | null>;
};

export const PLANOS_CATALOGO: PlanoCatalogoConfig[] = [
  {
    code: "STARTER",
    name: "Starter",
    priceMonthlyCents: 0,
    isTrial: true,
    trialDays: 14,
    modulosHabilitados: ["core", "properties", "crm"],
    limites: { PROPERTIES: 10, USERS: 1, PHOTOS_PER_PROPERTY: 5, CRM_CLIENTS: 100 },
  },
  {
    code: "BASICO",
    name: "Básico",
    priceMonthlyCents: 9900,
    isTrial: false,
    trialDays: null,
    // Fase 122-A (AUD-121-002) — "pipeline" deliberadamente ausente: o
    // BASICO mantém o CRM (clientes, negociações, agenda, analytics),
    // mas não tem o board do Pipeline.
    modulosHabilitados: ["core", "properties", "crm"],
    limites: { PROPERTIES: 50, USERS: 1, PHOTOS_PER_PROPERTY: 10, CRM_CLIENTS: 500 },
  },
  {
    code: "PRO",
    name: "Pro",
    priceMonthlyCents: 24900,
    isTrial: false,
    trialDays: null,
    modulosHabilitados: [
      "core",
      "properties",
      "crm",
      "leads",
      "pipeline",
      "agenda",
      "relatorios",
      "email",
      "whatsapp",
      // Fase P.10 — domínio próprio a partir do PRO; e-mail com domínio
      // próprio só no PREMIUM (via "TODOS" abaixo).
      "custom-domain",
    ],
    limites: { PROPERTIES: 250, USERS: 5, PHOTOS_PER_PROPERTY: 20, CRM_CLIENTS: 5000 },
  },
  {
    code: "PREMIUM",
    name: "Premium",
    priceMonthlyCents: 49900,
    isTrial: false,
    trialDays: null,
    modulosHabilitados: "TODOS",
    limites: { PROPERTIES: 1000, USERS: 15, PHOTOS_PER_PROPERTY: 40, CRM_CLIENTS: null },
  },
];

export function modulosHabilitadosDoPlano(plano: PlanoCatalogoConfig): string[] {
  return plano.modulosHabilitados === "TODOS"
    ? CATALOGO_MODULOS.map((m) => m.code)
    : plano.modulosHabilitados;
}

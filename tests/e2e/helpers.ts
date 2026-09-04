import type { Page } from "@playwright/test";

// Credenciais do seed determinístico (prisma/seed-e2e.ts) — lidas do mesmo
// .env.test que o seed usa, pra nunca divergir entre o dado seedado e o
// valor que o spec tenta logar.
export const ORG_A = {
  slug: process.env.ORG_SLUG ?? "e2e-org-a",
  email: process.env.SEED_ADMIN_EMAIL ?? "owner-a@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

export const ORG_B = {
  slug: "e2e-org-b",
  email: "owner-b@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Organização dedicada a agenda.spec.ts — nunca compartilhada com nenhum
// outro spec, especificamente pra isolar estruturalmente a métrica
// agregada que src/lib/pipeline.ts calcula sobre TODO o
// PropertyInterestStageHistory de uma organização (ver comentário em
// prisma/seed-e2e.ts, seção "Organização C").
export const ORG_AGENDA = {
  slug: "e2e-org-agenda",
  email: "owner-agenda@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

export const IDS_E2E = {
  imovelParaEditarOrgA: "e2e-imovel-editar-a",
  membroOwnerOrgB: "e2e-membro-owner-b",
  imovelOrgB: "e2e-imovel-org-b",
  imovelOrgAgenda: "e2e-imovel-org-agenda",
  // Redesenho de Imóveis — fixo e nunca mutado por outro spec (diferente
  // de imovelParaEditarOrgA, que "editar imóvel" reescreve): garante
  // badges (Lançamento/Destaque/Oportunidade/Slideshow) e os KPIs
  // Oportunidades/Destaques sempre com pelo menos 1 registro real,
  // deterministicamente, em qualquer ordem de execução dos specs.
  imovelComBadgesOrgA: "e2e-imovel-badges-a",
  // Fase 2 (detalhe do imóvel) — o contraponto do imóvel acima: RENT com
  // rentPrice e sem condomínio, IPTU, obra nem foto, usado pra provar que
  // cada bloco opcional da página some quando o dado não existe.
  imovelAluguelOrgA: "e2e-imovel-aluguel-a",
  // Fase 3 — lançamento MÍNIMO: tem o rótulo "Lançamento" e nada mais
  // (sem estágio de obra, previsão, construtora, planta ou
  // característica). Contraponto do imovelComBadgesOrgA, que tem a ficha
  // completa: juntos provam que cada bloco da experiência de lançamento
  // aparece por dado real e some sozinho quando o dado não existe.
  imovelLancamentoMinimoOrgA: "e2e-imovel-comercial-a",
};

// Fase P.10 — mesmo valor de prisma/seed-e2e.ts (duplicado de propósito,
// não importado de lá: importar prisma/seed-e2e.ts puxaria o Prisma
// Client inteiro pro processo do Playwright, que não roda sob o mesmo
// runtime ESM do Next — mesmo motivo de IDS_E2E acima já ser duplicado
// em vez de importado).
export const HOSTNAME_E2E_ORG_B = "b.e2e-dominio-teste.test";

export async function login(page: Page, credenciais: { email: string; senha: string }) {
  await page.goto("/app/login");
  await page.locator("#email").fill(credenciais.email);
  await page.locator("#senha").fill(credenciais.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/app");
}

// CamposAntiSpam bloqueia qualquer envio de formulário público que chegue
// em menos de 1.5s após o formulário renderizar (src/app/(public)/actions.ts,
// LIMIAR_MUITO_RAPIDO_MS) — Playwright preenche campos rápido demais pra
// esse limiar por padrão, então specs de formulário público esperam aqui
// antes de enviar.
export async function esperarJanelaAntiSpam(page: Page) {
  await page.waitForTimeout(1600);
}

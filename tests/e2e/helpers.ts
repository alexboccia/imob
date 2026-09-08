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

// Analytics comercial (Fase 5) — organização dedicada, pelo mesmo motivo
// estrutural de ORG_AGENDA: as asserções do Analytics são números
// absolutos, e Org A recebe contatos reais de public-form.spec.ts.
export const ORG_ANALYTICS = {
  slug: "e2e-org-analytics",
  email: "owner-analytics@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Central de trabalho (Fase 17) — organização dedicada, pelo mesmo motivo
// estrutural de ORG_AGENDA/ORG_ANALYTICS: a Home afirma números
// absolutos e pessoais, e o seed dela precisa ser imune à ordem de
// execução dos outros specs.
export const ORG_CENTRAL = {
  slug: "e2e-org-central",
  email: "owner-central@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 21 — o SEGUNDO corretor da Organização E, papel BROKER. Existe
// para provar o lado negativo da visão de equipe: sem autoridade
// gerencial, o alternador não aparece e `?visao=equipe` não revela nada.
export const ORG_CENTRAL_CORRETOR = {
  slug: "e2e-org-central",
  email: "corretor-central@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fuso horário (Fase 18) — organização dedicada e a ÚNICA do seed fora de
// UTC (America/Sao_Paulo). Existe para provar a borda de dia: uma visita
// das 23:30 locais pertence a hoje mesmo já sendo o dia seguinte em UTC.
export const ORG_FUSO = {
  slug: "e2e-org-fuso",
  email: "owner-fuso@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 22 — Organização G, a única do seed com política RESTRITA. Ana e
// Bruno são BROKER com carteiras separadas, e há um cliente
// compartilhado entre os dois.
// Fase 24 — Organização H: dedicada à captação de identidade ambígua.
export const ORG_CAPTACAO = {
  slug: "e2e-org-captacao",
  email: "owner-captacao@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

export const ORG_CAPTACAO_CORRETOR = {
  slug: "e2e-org-captacao",
  email: "corretor-captacao@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Os dois dados que colidem no seed: o e-mail pertence a uma pessoa, o
// telefone a outra. Enviá-los juntos é o que produz o conflito.
export const COLISAO_CAPTACAO = {
  email: "colisao@e2e.test",
  telefone: "11944440001",
};

export const ORG_RESTRITA = {
  slug: "e2e-org-restrita",
  email: "owner-restrita@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};
export const ORG_RESTRITA_ANA = {
  slug: "e2e-org-restrita",
  email: "ana-restrita@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};
export const ORG_RESTRITA_BRUNO = {
  slug: "e2e-org-restrita",
  email: "bruno-restrita@e2e.test",
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
  // Fase 5 — imóveis da Organização de Analytics (ver prisma/seed-e2e.ts,
  // seção "Organização D"): campeão do ranking, segundo colocado e um que
  // nunca recebe contato nenhum.
  imovelTopOrgAnalytics: "e2e-imovel-analytics-top",
  imovelSecundarioOrgAnalytics: "e2e-imovel-analytics-2",
  imovelSemContatoOrgAnalytics: "e2e-imovel-analytics-sem-contato",
};

// Fase P.10 — mesmo valor de prisma/seed-e2e.ts (duplicado de propósito,
// não importado de lá: importar prisma/seed-e2e.ts puxaria o Prisma
// Client inteiro pro processo do Playwright, que não roda sob o mesmo
// runtime ESM do Next — mesmo motivo de IDS_E2E acima já ser duplicado
// em vez de importado).
export const HOSTNAME_E2E_ORG_B = "b.e2e-dominio-teste.test";

// Fase 22 — troca de usuário DENTRO do mesmo teste. `login` sozinho não
// serve: com sessão ativa, /app/login redireciona para /app e o campo de
// e-mail nunca aparece. Limpar os cookies do contexto é o que torna a
// troca possível — e vários cenários de visibilidade precisam comparar
// dois corretores na mesma execução.
export async function entrarComo(page: Page, credenciais: { email: string; senha: string }) {
  // Limpar os cookies e ir direto para o formulário tem uma janela de
  // corrida: uma requisição em voo da página anterior pode reescrever o
  // cookie de sessão, e /app/login então REDIRECIONA para /app — o campo
  // #email nunca aparece e o fill estoura por timeout.
  //
  // Garante o estado deslogado ANTES de preencher, e preenche NA PÁGINA
  // JÁ VERIFICADA: uma primeira versão deste helper navegava, conferia, e
  // então chamava login(), que navegava de novo — a segunda navegação
  // reintroduzia exatamente a corrida que a conferência tinha eliminado.
  // Nada aqui é timeout maior nem retry de teste.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    await page.context().clearCookies();
    await page.goto("/app/login");
    if (await page.locator("#email").count()) break;
  }
  await preencherLogin(page, credenciais);
}

export async function login(page: Page, credenciais: { email: string; senha: string }) {
  await page.goto("/app/login");
  await preencherLogin(page, credenciais);
}

async function preencherLogin(page: Page, credenciais: { email: string; senha: string }) {
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

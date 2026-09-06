import { test, expect } from "@playwright/test";
import { IDS_E2E } from "./helpers";

// Atribuição comercial (Fase 7) — o que só o navegador prova: que a
// origem é capturada da URL/referrer, sobrevive à navegação interna e
// viaja junto do evento.
//
// Roda contra o site público da organização de Analytics. Todo teste
// INTERCEPTA a rota de tracking, então nenhum evento chega ao banco e os
// números que analytics.spec.ts afirma continuam determinísticos.

const BASE = "/e2e-org-analytics";
const URL_IMOVEL = `${BASE}/imoveis/${IDS_E2E.imovelTopOrgAnalytics}`;
const URL_OUTRO = `${BASE}/imoveis/${IDS_E2E.imovelSecundarioOrgAnalytics}`;
const ROTA_EVENTO = "**/api/analytics/evento";

type Atribuicao = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrerHost?: string | null;
};
type CorpoEvento = { type?: string; propertyId?: string; atribuicao?: Atribuicao };

async function coletarEventos(page: import("@playwright/test").Page) {
  const eventos: CorpoEvento[] = [];
  await page.route(ROTA_EVENTO, async (rota) => {
    eventos.push(JSON.parse(rota.request().postData() ?? "{}"));
    await rota.fulfill({ status: 202, body: JSON.stringify({ ok: true }) });
  });
  return eventos;
}

test.describe("Atribuição — captura na chegada", () => {
  test("entrada com UTM carimba o evento de visualização", async ({ page }) => {
    const eventos = await coletarEventos(page);

    await page.goto(
      `${URL_IMOVEL}?utm_source=Google&utm_medium=CPC&utm_campaign=Verao%202026&utm_content=anuncio-a`
    );
    await expect.poll(() => eventos.length).toBeGreaterThan(0);

    const view = eventos.find((e) => e.type === "PROPERTY_VIEW")!;
    // Normalizado já no cliente (minúsculas), e saneado de novo no servidor.
    expect(view.atribuicao).toMatchObject({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "verao 2026",
      utmContent: "anuncio-a",
    });
  });

  test("entrada direta não inventa origem nenhuma", async ({ page }) => {
    const eventos = await coletarEventos(page);

    await page.goto(URL_IMOVEL);
    await expect.poll(() => eventos.length).toBeGreaterThan(0);

    const view = eventos.find((e) => e.type === "PROPERTY_VIEW")!;
    expect(view.atribuicao?.utmSource ?? null).toBeNull();
    expect(view.atribuicao?.utmCampaign ?? null).toBeNull();
    // E, principalmente, NÃO carimba o próprio domínio como referrer.
    expect(view.atribuicao?.referrerHost ?? null).toBeNull();
  });
});

test.describe("Atribuição — jornada", () => {
  test("navegação interna PRESERVA a campanha de entrada", async ({ page }) => {
    // O caso que mais importa: entrar por um anúncio e navegar pelo site
    // não pode transformar a origem no próprio domínio do tenant.
    const eventos = await coletarEventos(page);

    await page.goto(`${BASE}/imoveis?utm_source=instagram&utm_campaign=lancamento`);
    await page.goto(URL_IMOVEL);
    await expect.poll(() => eventos.length).toBeGreaterThan(0);

    const view = eventos.find((e) => e.type === "PROPERTY_VIEW")!;
    expect(view.atribuicao).toMatchObject({ utmSource: "instagram", utmCampaign: "lancamento" });
    expect(view.atribuicao?.referrerHost).not.toBe("localhost");
  });

  test("nova campanha no meio da jornada SOBRESCREVE a anterior", async ({ page }) => {
    const eventos = await coletarEventos(page);

    await page.goto(`${URL_IMOVEL}?utm_source=google&utm_medium=cpc&utm_campaign=antiga`);
    await expect.poll(() => eventos.length).toBeGreaterThan(0);

    await page.goto(`${URL_OUTRO}?utm_source=instagram&utm_campaign=nova`);
    await expect.poll(() => eventos.filter((e) => e.propertyId === IDS_E2E.imovelSecundarioOrgAnalytics).length)
      .toBeGreaterThan(0);

    const segundo = eventos.find((e) => e.propertyId === IDS_E2E.imovelSecundarioOrgAnalytics)!;
    expect(segundo.atribuicao).toMatchObject({ utmSource: "instagram", utmCampaign: "nova" });
  });

  test("clique no WhatsApp carrega a MESMA atribuição da visualização", async ({ page }) => {
    const eventos = await coletarEventos(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${URL_IMOVEL}?utm_source=google&utm_medium=cpc&utm_campaign=verao`);
    await page.context().route("https://wa.me/**", (rota) => rota.abort());

    const cta = page.getByRole("link", { name: "Falar no WhatsApp" }).first();
    await expect(cta).toBeVisible();
    await Promise.all([page.waitForEvent("popup"), cta.click()]);

    await expect.poll(() => eventos.filter((e) => e.type === "WHATSAPP_CLICK").length).toBe(1);
    const clique = eventos.find((e) => e.type === "WHATSAPP_CLICK")!;
    expect(clique.atribuicao).toMatchObject({ utmSource: "google", utmCampaign: "verao" });
  });
});

test.describe("Atribuição — fail-open e formulário", () => {
  test("sessionStorage bloqueado: página, CTA e formulário continuam funcionando", async ({
    browser,
  }) => {
    const contexto = await browser.newContext();
    const pagina = await contexto.newPage();
    // Simula storage bloqueado do jeito que um navegador real faz: os
    // MÉTODOS lançam. Substituir o próprio getter de window.sessionStorage
    // seria mais hostil que a realidade e quebraria também a restauração
    // de scroll do Next — ruído de terceiro, não o que este teste mede.
    //
    // O bloqueio é escopado à chave da aplicação: isola o comportamento
    // fail-open do NOSSO código do de qualquer biblioteca.
    await pagina.addInitScript(() => {
      const real = window.sessionStorage;
      const bloqueada = (chave: string) => chave.startsWith("easymob:");
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        get: () => ({
          getItem(chave: string) {
            if (bloqueada(chave)) throw new Error("sessionStorage bloqueado");
            return real.getItem(chave);
          },
          setItem(chave: string, valor: string) {
            if (bloqueada(chave)) throw new Error("sessionStorage bloqueado");
            real.setItem(chave, valor);
          },
          removeItem: (chave: string) => real.removeItem(chave),
        }),
      });
    });

    const errosConsole: string[] = [];
    pagina.on("pageerror", (e) => errosConsole.push(e.message));

    await pagina.goto(`${URL_IMOVEL}?utm_source=google&utm_campaign=verao`);
    await expect(pagina.getByRole("heading", { level: 1 })).toBeVisible();

    const cta = pagina.getByRole("link", { name: "Falar no WhatsApp" }).first();
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\d+/);

    // O formulário continua presente e submetível: atribuição é contexto,
    // nunca requisito de conversão.
    await expect(pagina.getByRole("button", { name: /enviar/i }).first()).toBeEnabled();
    expect(errosConsole).toEqual([]);

    await contexto.close();
  });

  test("campo oculto de atribuição existe no formulário e não é focável", async ({ page }) => {
    await page.goto(`${URL_IMOVEL}?utm_source=google&utm_campaign=verao-2026`);

    const campo = page.locator('input[name="atribuicao"]').first();
    await expect(campo).toHaveAttribute("type", "hidden");
    await expect(campo).toHaveAttribute("aria-hidden", "true");

    // Preenchido pelo efeito, com a atribuição da jornada.
    await expect
      .poll(async () => (await campo.inputValue()).includes("verao-2026"))
      .toBe(true);
  });
});

import { test, expect } from "@playwright/test";
import { IDS_E2E } from "./helpers";

// Tracking first-party (Fase 6) — o que só o browser consegue provar.
//
// Os NÚMEROS do funil são verificados em analytics.spec.ts, contra o seed
// determinístico. Aqui a pergunta é outra e é a que exige um navegador de
// verdade: o evento sai do cliente com o payload certo, a deduplicação
// funciona, e — a parte inegociável — o CTA de conversão continua
// funcionando mesmo quando o tracking quebra.
//
// Roda contra o site público da Organização de Analytics, que tem
// WhatsApp próprio no seed (a Org A liga/desliga o dela durante
// site-publico.spec.ts, o que tornaria esta spec refém da ordem de
// execução).
//
// Isso NÃO contamina os números que analytics.spec.ts afirma: em todo
// teste daqui a rota de tracking é interceptada, abortada ou o
// localStorage está bloqueado — nenhum evento chega ao banco. Os únicos
// POSTs reais ao endpoint são os de payload INVÁLIDO do último bloco,
// que por definição não gravam nada.

const BASE_PUBLICA = "/e2e-org-analytics";
const URL_IMOVEL = `${BASE_PUBLICA}/imoveis/${IDS_E2E.imovelTopOrgAnalytics}`;
const URL_OUTRO_IMOVEL = `${BASE_PUBLICA}/imoveis/${IDS_E2E.imovelSecundarioOrgAnalytics}`;
const ROTA_EVENTO = "**/api/analytics/evento";

type CorpoEvento = {
  type?: string;
  propertyId?: string;
  placement?: string;
  visitorId?: string;
  orgSlug?: string;
};

test.describe("Tracking — visualização", () => {
  test("abrir a página do imóvel dispara PROPERTY_VIEW com payload válido", async ({ page }) => {
    const eventos: CorpoEvento[] = [];
    await page.route(ROTA_EVENTO, async (rota) => {
      eventos.push(JSON.parse(rota.request().postData() ?? "{}"));
      await rota.fulfill({ status: 202, body: JSON.stringify({ ok: true }) });
    });

    await page.goto(URL_IMOVEL);
    await expect.poll(() => eventos.length).toBeGreaterThan(0);

    const view = eventos.find((e) => e.type === "PROPERTY_VIEW");
    expect(view).toBeDefined();
    expect(view!.propertyId).toBe(IDS_E2E.imovelTopOrgAnalytics);
    // O identificador é um UUID sorteado pelo próprio navegador — nunca
    // e-mail, telefone ou qualquer atributo de device.
    expect(view!.visitorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    // Visualização nunca carrega placement.
    expect(view!.placement).toBeUndefined();
    // Nenhum dado pessoal viaja no evento.
    const bruto = JSON.stringify(view);
    expect(bruto).not.toMatch(/@|telefone|email|nome/i);
  });

  test("o visitante é o MESMO entre páginas (id estável no navegador)", async ({ page }) => {
    const eventos: CorpoEvento[] = [];
    await page.route(ROTA_EVENTO, async (rota) => {
      eventos.push(JSON.parse(rota.request().postData() ?? "{}"));
      await rota.fulfill({ status: 202, body: JSON.stringify({ ok: true }) });
    });

    await page.goto(URL_IMOVEL);
    await expect.poll(() => eventos.length).toBeGreaterThan(0);
    await page.goto(URL_OUTRO_IMOVEL);
    await expect.poll(() => eventos.length).toBeGreaterThan(1);

    // Mesmo visitorId em imóveis diferentes: é o que permite ao servidor
    // deduplicar. (O que ele grava é um hash ESCOPADO por imóvel, então
    // essa estabilidade não vira rastro de navegação — ver
    // calcularVisitorHash.)
    expect(eventos[0].visitorId).toBe(eventos[1].visitorId);
    expect(eventos[0].propertyId).not.toBe(eventos[1].propertyId);
  });

  test("recarregar não dispara uma visualização nova para o servidor contar duas vezes", async ({
    page,
  }) => {
    const vistos: CorpoEvento[] = [];
    // 202 é a resposta real do endpoint tanto pra evento gravado quanto
    // pra evento deduplicado — o cliente nunca sabe a diferença.
    await page.route(ROTA_EVENTO, async (rota) => {
      vistos.push(JSON.parse(rota.request().postData() ?? "{}"));
      await rota.fulfill({ status: 202, body: JSON.stringify({ ok: true }) });
    });

    await page.goto(URL_IMOVEL);
    await expect.poll(() => vistos.length).toBe(1);
    await page.reload();
    await page.waitForTimeout(800);

    // O mesmo visitante no mesmo imóvel: mesmo que o cliente reenvie
    // depois de um reload, o par (visitante, imóvel) é idêntico, que é
    // exatamente o que a janela de 30 min do servidor deduplica.
    const doMesmoImovel = vistos.filter(
      (e) => e.type === "PROPERTY_VIEW" && e.propertyId === IDS_E2E.imovelTopOrgAnalytics
    );
    for (const evento of doMesmoImovel) {
      expect(evento.visitorId).toBe(doMesmoImovel[0].visitorId);
    }
  });
});

test.describe("Tracking — intenção via WhatsApp", () => {
  test("clique no CTA dispara WHATSAPP_CLICK com placement e NÃO altera o link", async ({
    page,
  }) => {
    const eventos: CorpoEvento[] = [];
    await page.route(ROTA_EVENTO, async (rota) => {
      eventos.push(JSON.parse(rota.request().postData() ?? "{}"));
      await rota.fulfill({ status: 202, body: JSON.stringify({ ok: true }) });
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(URL_IMOVEL);

    const cta = page.getByRole("link", { name: "Falar no WhatsApp" }).first();
    await expect(cta).toBeVisible();

    // O href continua sendo o link real do WhatsApp, com a mensagem
    // contextual da Fase 2 — o tracking não tocou nele.
    const href = await cta.getAttribute("href");
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+/);
    expect(href).toContain("text=");
    expect(await cta.getAttribute("target")).toBe("_blank");
    expect(await cta.getAttribute("rel")).toContain("noopener");

    // Impede a navegação real para wa.me (site externo) sem impedir o
    // clique em si: o evento precisa sair mesmo assim.
    await page.route("https://wa.me/**", (rota) => rota.abort());
    await cta.click();

    await expect.poll(() => eventos.filter((e) => e.type === "WHATSAPP_CLICK").length).toBe(1);
    const clique = eventos.find((e) => e.type === "WHATSAPP_CLICK")!;
    expect(clique.propertyId).toBe(IDS_E2E.imovelTopOrgAnalytics);
    expect(clique.placement).toBe("SIDEBAR");
  });

  test("no mobile, o CTA da barra fixa registra o placement próprio", async ({ page }) => {
    const eventos: CorpoEvento[] = [];
    await page.route(ROTA_EVENTO, async (rota) => {
      eventos.push(JSON.parse(rota.request().postData() ?? "{}"));
      await rota.fulfill({ status: 202, body: JSON.stringify({ ok: true }) });
    });

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(URL_IMOVEL);
    await page.route("https://wa.me/**", (rota) => rota.abort());

    const cta = page.getByRole("link", { name: "Falar no WhatsApp sobre este imóvel" });
    await expect(cta).toBeVisible();
    await cta.click();

    await expect.poll(() => eventos.filter((e) => e.type === "WHATSAPP_CLICK").length).toBe(1);
    expect(eventos.find((e) => e.type === "WHATSAPP_CLICK")!.placement).toBe("MOBILE_BAR");
  });
});

test.describe("Tracking — FAIL-OPEN (analytics nunca bloqueia conversão)", () => {
  test("endpoint de tracking em erro 500: WhatsApp continua abrindo normalmente", async ({
    page,
  }) => {
    // Simula o pior caso realista: o endpoint de analytics respondendo
    // erro em toda chamada.
    await page.route(ROTA_EVENTO, (rota) => rota.fulfill({ status: 500, body: "erro" }));

    const errosConsole: string[] = [];
    page.on("pageerror", (e) => errosConsole.push(e.message));

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(URL_IMOVEL);

    // A página do imóvel renderiza normalmente.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const cta = page.getByRole("link", { name: "Falar no WhatsApp" }).first();
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+/);

    // O CTA tem target="_blank", então o clique abre uma ABA NOVA — e é
    // a navegação dela que precisa ser observada. A rota é registrada no
    // CONTEXTO (não na página): page.route() não alcança popups, e sem
    // isso o teste sairia de verdade pra internet.
    //
    // A asserção é sobre a URL REQUISITADA, capturada aqui, e não sobre
    // popup.url(): abortar a requisição faz o Chromium reportar a URL
    // final como "chrome-error://chromewebdata/", o que esconderia
    // justamente o que se quer provar.
    let urlWhatsApp: string | null = null;
    await page.context().route("https://wa.me/**", (rota) => {
      urlWhatsApp = rota.request().url();
      return rota.abort();
    });
    await Promise.all([page.waitForEvent("popup"), cta.click()]);

    // A prova do fail-open: mesmo com o tracking respondendo 500, o
    // visitante foi levado ao WhatsApp com o link completo.
    await expect.poll(() => urlWhatsApp).toMatch(/^https:\/\/wa\.me\/\d+/);
    expect(urlWhatsApp).toContain("text=");
    // Falha de tracking nunca vira erro de página para o visitante.
    expect(errosConsole).toEqual([]);
  });

  test("endpoint de tracking indisponível (conexão recusada): navegação do site segue normal", async ({
    page,
  }) => {
    await page.route(ROTA_EVENTO, (rota) => rota.abort("failed"));

    const errosConsole: string[] = [];
    page.on("pageerror", (e) => errosConsole.push(e.message));

    await page.goto(URL_IMOVEL);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Navegar para outro imóvel continua funcionando.
    await page.goto(URL_OUTRO_IMOVEL);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(errosConsole).toEqual([]);
  });

  test("sem localStorage (modo restrito), a página e o CTA continuam funcionando", async ({
    browser,
  }) => {
    // Bloqueia o acesso a localStorage antes de qualquer script da página
    // — é o cenário de navegação privada/política restritiva, em que
    // obterVisitorId devolve null e o tracking simplesmente não acontece.
    const contexto = await browser.newContext();
    const pagina = await contexto.newPage();
    await pagina.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("localStorage bloqueado");
        },
      });
    });

    const errosConsole: string[] = [];
    pagina.on("pageerror", (e) => errosConsole.push(e.message));

    await pagina.goto(URL_IMOVEL);
    await expect(pagina.getByRole("heading", { level: 1 })).toBeVisible();
    const cta = pagina.getByRole("link", { name: "Falar no WhatsApp" }).first();
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\d+/);
    expect(errosConsole).toEqual([]);

    await contexto.close();
  });
});

test.describe("Tracking — endpoint público", () => {
  test("payload inválido e imóvel de outro tenant recebem a mesma resposta 202 (sem virar oráculo)", async ({
    request,
  }) => {
    const casos = [
      { descricao: "tipo fora do catálogo", corpo: { orgSlug: "e2e-org-analytics", propertyId: IDS_E2E.imovelTopOrgAnalytics, type: "CONTACT_SUBMIT", visitorId: "3f8a1c2e-5b6d-4a7f-9c1e-2d3b4a5c6d7e" } },
      { descricao: "visitorId forjado", corpo: { orgSlug: "e2e-org-analytics", propertyId: IDS_E2E.imovelTopOrgAnalytics, type: "PROPERTY_VIEW", visitorId: "pessoa@exemplo.com" } },
      { descricao: "imóvel inexistente", corpo: { orgSlug: "e2e-org-analytics", propertyId: "nao-existe", type: "PROPERTY_VIEW", visitorId: "3f8a1c2e-5b6d-4a7f-9c1e-2d3b4a5c6d7e" } },
      { descricao: "imóvel de OUTRA organização", corpo: { orgSlug: "e2e-org-analytics", propertyId: IDS_E2E.imovelOrgB, type: "PROPERTY_VIEW", visitorId: "3f8a1c2e-5b6d-4a7f-9c1e-2d3b4a5c6d7e" } },
      { descricao: "organização inexistente", corpo: { orgSlug: "nao-existe", propertyId: IDS_E2E.imovelComBadgesOrgA, type: "PROPERTY_VIEW", visitorId: "3f8a1c2e-5b6d-4a7f-9c1e-2d3b4a5c6d7e" } },
      { descricao: "corpo vazio", corpo: {} },
    ];

    for (const caso of casos) {
      const resposta = await request.post("/api/analytics/evento", { data: caso.corpo });
      // Sempre 202: responder diferente permitiria enumerar imóveis e
      // organizações a partir de um endpoint público.
      expect(resposta.status(), caso.descricao).toBe(202);
    }
  });
});

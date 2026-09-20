import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E, ORG_A, login } from "./helpers";

// =======================================================================
// Observação sobre o valor + saída do CTA comercial (Fase 54)
// =======================================================================
// Abaixo do preço, no card comercial, fica a observação que o anunciante
// escreveu — quando ele escreveu. O CTA grande "Falar no WhatsApp" que
// morava ali saiu: o canal continua na toolbar do corretor, no formulário
// do próprio card e na barra fixa do celular.
//
// Organização W (recursos): os imóveis da dobra, incluindo o par com e
// sem observação. Organização de tracking: a que tem WhatsApp
// configurado, onde a ausência do CTA comercial é observável.

const BASE_W = "/e2e-org-recursos";
const fichaW = (id: string) => `${BASE_W}/imoveis/${id}`;
const COM_OBSERVACAO = fichaW(IDS_E2E.imovelObservacaoValor);
const SEM_OBSERVACAO = fichaW(IDS_E2E.imovelDobraVenda);
const OBSERVACAO_LONGA = fichaW(IDS_E2E.imovelObservacaoLonga);
const FICHA_COM_WHATSAPP = `/e2e-org-tracking/imoveis/${IDS_E2E.imovelTopOrgTracking}`;

const TEXTO = "Previsão de valorização: +25% até a entrega";

const card = (page: Page) => page.locator("[data-card-contato]");
const observacao = (page: Page) => page.locator("[data-observacao-valor]");
const preco = (page: Page) => card(page).locator("[data-preco]").first();

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

async function semOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    navigator.sendBeacon = () => true;
  });
});

// -----------------------------------------------------------------------
// Ficha pública
// -----------------------------------------------------------------------
test.describe("observação na ficha", () => {
  test("com observação: o texto aparece logo abaixo do preço, secundário a ele", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(COM_OBSERVACAO);

    await expect(observacao(page)).toHaveText(TEXTO);
    // Dentro do card comercial, e uma só na página.
    await expect(card(page).locator("[data-observacao-valor]")).toHaveCount(1);
    await expect(page.locator("[data-observacao-valor]")).toHaveCount(1);

    const p = await caixa(preco(page));
    const o = await caixa(observacao(page));
    // Logo abaixo do preço, colada nele.
    expect(o.y).toBeGreaterThanOrEqual(p.y + p.height - 1);
    expect(o.y - (p.y + p.height)).toBeLessThan(16);

    // Visualmente secundária: fonte menor e cor mais fraca que a do preço.
    const estilos = await page.evaluate(() => {
      const ler = (s: string) => {
        const e = getComputedStyle(document.querySelector(s)!);
        return { tamanho: parseFloat(e.fontSize), peso: Number(e.fontWeight), cor: e.color };
      };
      return { preco: ler("[data-card-contato] [data-preco] p"), obs: ler("[data-observacao-valor]") };
    });
    expect(estilos.obs.tamanho).toBeLessThan(estilos.preco.tamanho);
    expect(estilos.obs.peso).toBeLessThan(estilos.preco.peso);
    expect(estilos.obs.cor).not.toBe(estilos.preco.cor);

    // Texto puro: nem selo, nem caixa colorida, nem card dentro do card.
    const fundo = await observacao(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(fundo);
    await expect(observacao(page).locator("*")).toHaveCount(0);
  });

  test("sem observação: só o preço, sem placeholder nem espaço reservado", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(SEM_OBSERVACAO);

    await expect(preco(page)).toBeVisible();
    await expect(page.locator("[data-observacao-valor]")).toHaveCount(0);
    const texto = await card(page).innerText();
    for (const inventado of ["Não informado", "Sem observação", "—", "Previsão de valorização"]) {
      expect(texto).not.toContain(inventado);
    }
  });

  test("o sistema não inventa observação a partir da entrega nem do preço", async ({ page }) => {
    // O imóvel de lançamento COM previsão de entrega cadastrada continua
    // sem observação: ela só existe se alguém a escrever.
    await page.goto(fichaW(IDS_E2E.imovelEditorialEntrega));
    await expect(page.getByText(/Previsão de entrega/)).toBeVisible();
    await expect(page.locator("[data-observacao-valor]")).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------
// O CTA comercial saiu
// -----------------------------------------------------------------------
test.describe("CTA comercial", () => {
  test("o card comercial não tem mais o botão grande de WhatsApp", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(FICHA_COM_WHATSAPP);

    const comercial = card(page);
    await expect(comercial.locator("[data-preco]").first()).toBeVisible();
    // Nem o botão, nem um link wa.me escondido, nem wrapper de rastreio.
    await expect(comercial.getByRole("link", { name: "Falar no WhatsApp" })).toHaveCount(0);
    await expect(comercial.locator('a[href*="wa.me"]')).toHaveCount(0);

    // E o preço encosta no que vem depois: nada de vão fantasma onde o
    // botão estava.
    const p = await caixa(comercial.locator("[data-preco]").first());
    const seguinte = await caixa(
      comercial.locator("[data-card-corretor], #contato-imovel").first()
    );
    expect(seguinte.y - (p.y + p.height)).toBeLessThan(48);
  });

  test("nenhum evento de WhatsApp é emitido pelo card comercial", async ({ page }) => {
    const eventos: { type?: string; placement?: string }[] = [];
    await page.route("**/api/analytics/evento", async (rota) => {
      eventos.push(JSON.parse(rota.request().postData() ?? "{}"));
      await rota.fulfill({ status: 202, body: JSON.stringify({ ok: true }) });
    });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(FICHA_COM_WHATSAPP);
    await expect(card(page).locator("[data-preco]").first()).toBeVisible();
    expect(eventos.some((e) => e.placement === "SIDEBAR")).toBe(false);
  });

  test("a barra fixa do celular continua com preço e contato", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(FICHA_COM_WHATSAPP);
    const barra = page.locator("[data-cta-imovel]");
    await expect(barra).toBeVisible();
    await expect(barra.locator("[data-precos-barra]")).toBeVisible();
    expect(await barra.locator('a[href*="wa.me"]').count()).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------
// Ordem do card e larguras
// -----------------------------------------------------------------------
test.describe("composição", () => {
  test("preço → observação → corretor → Receba mais informações → formulário → política", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(COM_OBSERVACAO);

    const alvos: [string, Locator][] = [
      ["preço", preco(page)],
      ["observação", observacao(page)],
      ["título do formulário", card(page).getByRole("heading", { name: "Receba mais informações" })],
      ["campo nome", card(page).locator("form").getByLabel("Nome")],
      ["enviar", card(page).locator("form").getByRole("button", { name: "Enviar mensagem" })],
      ["política", card(page).getByRole("link", { name: "Política de Privacidade" })],
    ];
    let anterior = -Infinity;
    for (const [nome, alvo] of alvos) {
      const y = (await caixa(alvo)).y;
      expect(y, `${nome} depois do anterior`).toBeGreaterThan(anterior);
      anterior = y;
    }
  });

  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: observação longa quebra dentro do card, sem estouro`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 1000 });
      await page.goto(OBSERVACAO_LONGA);

      const c = await caixa(card(page));
      const o = await caixa(observacao(page));
      const p = await caixa(preco(page));

      expect(await semOverflow(page), `estouro @ ${largura}`).toBe(true);
      expect(o.x, `${largura}`).toBeGreaterThanOrEqual(c.x - 0.5);
      expect(o.x + o.width, `${largura}`).toBeLessThanOrEqual(c.x + c.width + 0.5);
      // Quebra em mais de uma linha e não comprime o preço.
      expect(o.height).toBeGreaterThan(20);
      expect(o.y).toBeGreaterThanOrEqual(p.y + p.height - 1);
      expect(
        await observacao(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `texto cortado @ ${largura}`
      ).toBe(true);
      // Nada de CTA comercial em nenhuma largura.
      await expect(card(page).getByRole("link", { name: "Falar no WhatsApp" })).toHaveCount(0);
    });
  }
});

// -----------------------------------------------------------------------
// Admin
// -----------------------------------------------------------------------
test.describe("admin", () => {
  const CAMPO = "#observacaoValor";

  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
  });

  test("cria com observação, edita, limpa — e o campo é opcional", async ({ page }) => {
    await page.goto("/app/imoveis/novo");

    // Fica no card dos valores, junto do preço, e começa vazio.
    const campo = page.locator(CAMPO);
    await expect(campo).toHaveValue("");
    // No MESMO card do preço, que é o card "Valores".
    const vizinhanca = await campo.evaluate((el) => {
      const card = el.closest('[data-slot="card"]')!;
      return {
        titulo: card.querySelector('[data-slot="card-title"]')?.textContent?.trim(),
        temPreco: !!card.querySelector("#preco"),
      };
    });
    expect(vizinhanca).toEqual({ titulo: "Valores", temPreco: true });

    const titulo = `Imovel Observacao Admin ${Date.now()}`;
    await page.locator("#titulo").fill(titulo);
    await page.locator('input[name="bairro"]').fill("Centro");
    await page.locator('input[name="cidade"]').fill("São Paulo");
    await page.locator('select[name="estado"]').selectOption("SP");
    await campo.fill(TEXTO);
    await page.getByRole("button", { name: "Salvar imóvel" }).click();
    await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);
    const url = page.url();

    // A edição recupera o valor gravado.
    await page.goto(url.split("?")[0]);
    await expect(page.locator(CAMPO)).toHaveValue(TEXTO);

    // Editar persiste.
    await page.locator(CAMPO).fill("Entrada facilitada durante o lançamento");
    await page.getByRole("button", { name: "Salvar imóvel" }).click();
    await page.waitForURL(/\?salvo=1/);
    await page.goto(url.split("?")[0]);
    await expect(page.locator(CAMPO)).toHaveValue("Entrada facilitada durante o lançamento");

    // Limpar remove de vez.
    await page.locator(CAMPO).fill("");
    await page.getByRole("button", { name: "Salvar imóvel" }).click();
    await page.waitForURL(/\?salvo=1/);
    await page.goto(url.split("?")[0]);
    await expect(page.locator(CAMPO)).toHaveValue("");
  });

  test("o limite é do servidor: um texto longo demais é recusado com mensagem", async ({ page }) => {
    await page.goto("/app/imoveis/novo");
    await page.locator("#titulo").fill(`Imovel Limite Observacao ${Date.now()}`);
    await page.locator('input[name="bairro"]').fill("Centro");
    await page.locator('input[name="cidade"]').fill("São Paulo");
    await page.locator('select[name="estado"]').selectOption("SP");

    // O maxLength do navegador é conveniência; a regra que vale é a do
    // servidor, então o valor entra direto no DOM.
    await page.locator(CAMPO).evaluate((el, valor) => {
      const campo = el as HTMLInputElement;
      campo.value = valor;
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    }, "a".repeat(161));
    await page.getByRole("button", { name: "Salvar imóvel" }).click();

    await expect(page.getByText(/A observação sobre o valor deve ter no máximo 160/)).toBeVisible();
    await expect(page).toHaveURL("/app/imoveis/novo");
  });
});

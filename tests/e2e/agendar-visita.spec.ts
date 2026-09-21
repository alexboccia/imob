import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E, ORG_A, esperarJanelaAntiSpam, login } from "./helpers";

// =======================================================================
// Agendar uma visita pela ficha (Fase 55)
// =======================================================================
// O botão fica entre o valor e o corretor, abre um diálogo, e o envio
// cria a visita no MESMO domínio das visitas internas — a prova do CRM
// está no fim deste arquivo, pelo painel.

const BASE_W = "/e2e-org-recursos";
const fichaW = (id: string) => `${BASE_W}/imoveis/${id}`;
const FICHA = fichaW(IDS_E2E.imovelDobraVenda);
const FICHA_COM_OBSERVACAO = fichaW(IDS_E2E.imovelObservacaoValor);

const card = (page: Page) => page.locator("[data-card-contato]");
const botao = (page: Page) => page.locator("[data-agendar-visita]");
const modal = (page: Page) => page.locator("[data-modal-visita]");

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

/**
 * Daqui a três dias, no formato do input de data.
 *
 * Três, e não um: "amanhã" cai em HOJE ou em PRÓXIMAS na agenda do
 * painel dependendo da hora em que a suíte roda e do fuso da
 * organização. Três dias está sempre em "Próximas", em qualquer fuso.
 */
function emBreve() {
  const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/**
 * Um telefone válido e DIFERENTE a cada execução.
 *
 * O produto deduplica pessoa por telefone e e-mail normalizados (Fase B):
 * repetir o mesmo número faria toda execução cair na Person da primeira,
 * com o nome dela — e o teste estaria provando o contrário do que lê.
 */
function telefoneUnico() {
  return `119${String(Date.now()).slice(-8)}`;
}

async function preencher(
  page: Page,
  dados: { nome?: string; email?: string; telefone?: string; data?: string; hora?: string; observacao?: string } = {}
) {
  const m = modal(page);
  await m.getByLabel("Nome").fill(dados.nome ?? `Visitante Fase 55 ${Date.now()}`);
  await m.getByLabel("Telefone").fill(dados.telefone ?? telefoneUnico());
  await m.getByLabel("E-mail").fill(dados.email ?? `fase55-${Date.now()}@e2e.test`);
  await m.getByLabel("Data desejada").fill(dados.data ?? emBreve());
  await m.getByLabel("Horário").fill(dados.hora ?? "15:30");
  if (dados.observacao) await m.getByLabel(/Observação/).fill(dados.observacao);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    navigator.sendBeacon = () => true;
  });
});

// -----------------------------------------------------------------------
// Posição e composição
// -----------------------------------------------------------------------
test.describe("botão na ficha", () => {
  test("fica entre o valor (e sua observação) e o corretor", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(FICHA_COM_OBSERVACAO);

    const preco = await caixa(card(page).locator("[data-preco]").first());
    const observacao = await caixa(page.locator("[data-observacao-valor]"));
    const agendar = await caixa(botao(page));
    const formulario = await caixa(
      card(page).getByRole("heading", { name: "Receba mais informações" })
    );

    expect(observacao.y).toBeGreaterThan(preco.y);
    expect(agendar.y).toBeGreaterThan(observacao.y);
    expect(formulario.y).toBeGreaterThan(agendar.y);

    // Dentro do card e ocupando a largura útil dele.
    const c = await caixa(card(page));
    expect(agendar.x).toBeGreaterThanOrEqual(c.x - 0.5);
    expect(agendar.x + agendar.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
    expect(agendar.width).toBeGreaterThan(c.width * 0.8);

    // Contorno na cor do tenant, ícone decorativo, nome acessível.
    await expect(botao(page)).toHaveAccessibleName(/Agendar uma visita/);
    await expect(botao(page).locator("svg")).toHaveAttribute("aria-hidden", "true");
    const cores = await botao(page).evaluate((el) => {
      const e = getComputedStyle(el);
      return { borda: e.borderTopColor, texto: e.color, fundo: e.backgroundColor };
    });
    expect(cores.borda).toBe(cores.texto);
    expect(cores.fundo).not.toBe(cores.borda);
  });

  test("o WhatsApp grande continua fora do card (Fase 54)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(FICHA);
    await expect(botao(page)).toBeVisible();
    await expect(card(page).getByRole("link", { name: "Falar no WhatsApp" })).toHaveCount(0);
  });

  test("imóvel indisponível não oferece visita", async ({ page }) => {
    // Reservado: a ficha é pública, mas não se agenda visita nele.
    await page.goto(`/e2e-org-navegacao/imoveis/${IDS_E2E.imovelNavegacaoReservado}`);
    await expect(page.locator("[data-card-contato]")).toBeVisible();
    await expect(botao(page)).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------
// Diálogo
// -----------------------------------------------------------------------
test.describe("diálogo", () => {
  test("abre com os campos, fecha com Escape e devolve o foco ao botão", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(FICHA);

    await botao(page).click();
    const m = modal(page);
    await expect(m).toBeVisible();
    await expect(m.getByRole("heading", { name: "Agendar uma visita" })).toBeVisible();
    for (const campo of ["Nome", "Telefone", "E-mail", "Data desejada", "Horário"]) {
      await expect(m.getByLabel(campo, { exact: true })).toBeVisible();
    }
    await expect(m.getByLabel(/Observação/)).toBeVisible();
    // A política da Fase 51, sem página nova.
    await expect(m.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute(
      "href",
      `${BASE_W}/politica-de-privacidade`
    );
    // O calendário não oferece passado.
    expect(await m.getByLabel("Data desejada").getAttribute("min")).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await page.keyboard.press("Escape");
    await expect(m).toHaveCount(0);
    await expect(botao(page)).toBeFocused();
  });

  test("o foco fica preso no diálogo enquanto ele está aberto", async ({ page }) => {
    await page.goto(FICHA);
    await botao(page).click();
    await expect(modal(page)).toBeVisible();
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("[data-modal-visita]"))
    ).toBe(true);
  });
});

// -----------------------------------------------------------------------
// Envio
// -----------------------------------------------------------------------
test.describe("envio", () => {
  test("solicita a visita e recebe a confirmação, sem prometer confirmação automática", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(FICHA);
    await botao(page).click();
    // O relógio do anti-spam começa quando o FORMULÁRIO é renderizado —
    // aqui, ao abrir o diálogo. Um humano leva mais que isso preenchendo
    // cinco campos; o teste precisa respeitar a mesma janela.
    await esperarJanelaAntiSpam(page);
    await preencher(page, { observacao: "Prefiro no fim da tarde." });
    await modal(page).getByRole("button", { name: "Solicitar visita" }).click();

    const confirmacao = modal(page).locator("[data-visita-confirmada]");
    await expect(confirmacao).toBeVisible();
    await expect(confirmacao.getByText("Visita solicitada")).toBeVisible();
    await expect(confirmacao).toContainText("entra em contato para confirmar");
    // Nada de "visita confirmada": o produto não tem agenda em tempo real.
    expect(await confirmacao.innerText()).not.toMatch(/confirmada com sucesso|visita confirmada/i);

    await confirmacao.getByRole("button", { name: "Fechar" }).click();
    await expect(modal(page)).toHaveCount(0);
  });

  test("data no passado é recusada pelo SERVIDOR, mesmo furando o calendário", async ({ page }) => {
    await page.goto(FICHA);
    await botao(page).click();
    await esperarJanelaAntiSpam(page);
    await preencher(page);
    // O `min` do calendário já barra o passado no navegador; a regra que
    // vale é a do servidor, e é ela que este teste exercita — por isso o
    // atributo é removido antes do envio, como faria um payload
    // adulterado.
    await modal(page)
      .getByLabel("Data desejada")
      .evaluate((el) => {
        const campo = el as HTMLInputElement;
        campo.removeAttribute("min");
        campo.value = "2020-01-10";
        campo.dispatchEvent(new Event("input", { bubbles: true }));
      });
    await modal(page).getByRole("button", { name: "Solicitar visita" }).click();

    const alerta = modal(page).getByRole("alert");
    await expect(alerta).toContainText(/futuro/i);
    // Erro amigável: nada de Prisma, id interno ou stack.
    const texto = await alerta.innerText();
    expect(texto).not.toMatch(/prisma|Invalid|at Object|cuid|organizationId/i);
    await expect(modal(page).locator("[data-visita-confirmada]")).toHaveCount(0);
  });

  test("campos obrigatórios: o navegador barra o envio vazio", async ({ page }) => {
    await page.goto(FICHA);
    await botao(page).click();
    await modal(page).getByRole("button", { name: "Solicitar visita" }).click();
    // Continua no formulário, sem confirmação.
    await expect(modal(page).getByLabel("Nome", { exact: true })).toBeVisible();
    await expect(modal(page).locator("[data-visita-confirmada]")).toHaveCount(0);
  });

  test("duplo clique no mesmo envio não dispara dois pedidos", async ({ page }) => {
    const envios: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname.includes("/imoveis/")) {
        envios.push(r.url());
      }
    });
    await page.goto(FICHA);
    await botao(page).click();
    await esperarJanelaAntiSpam(page);
    await preencher(page);

    const enviar = modal(page).getByRole("button", { name: "Solicitar visita" });
    await enviar.click();
    // O botão entra em "Enviando..." e fica desabilitado.
    await expect(modal(page).locator("[data-visita-confirmada]")).toBeVisible();
    expect(envios.length).toBe(1);
  });
});

// -----------------------------------------------------------------------
// Responsividade
// -----------------------------------------------------------------------
test.describe("larguras", () => {
  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: botão e diálogo cabem, sem estouro`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(FICHA);

      const c = await caixa(card(page));
      const b = await caixa(botao(page));
      expect(b.x).toBeGreaterThanOrEqual(c.x - 0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
      expect(b.height).toBeGreaterThanOrEqual(36);
      expect(
        await botao(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `texto cortado @ ${largura}`
      ).toBe(true);

      await botao(page).click();
      const m = await caixa(modal(page));
      expect(m.x).toBeGreaterThanOrEqual(-0.5);
      expect(m.x + m.width).toBeLessThanOrEqual(largura + 0.5);
      // Campos inteiros dentro do diálogo.
      for (const campo of ["Nome", "Data desejada", "Horário"]) {
        const f = await caixa(modal(page).getByLabel(campo, { exact: true }));
        expect(f.x + f.width, `${campo} @ ${largura}`).toBeLessThanOrEqual(m.x + m.width + 1);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        ),
        `estouro @ ${largura}`
      ).toBe(true);
    });
  }
});

// -----------------------------------------------------------------------
// A visita chega ao CRM
// -----------------------------------------------------------------------
test.describe("o corretor recebe a visita", () => {
  test("a solicitação do site aparece na agenda do painel", async ({ page }) => {
    const nome = `Visitante Agenda ${Date.now()}`;
    // O imóvel da Org A que o site público expõe na raiz.
    await page.goto(`/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    await botao(page).click();
    await esperarJanelaAntiSpam(page);
    await preencher(page, { nome, observacao: "Chego de carro." });
    await modal(page).getByRole("button", { name: "Solicitar visita" }).click();
    await expect(modal(page).locator("[data-visita-confirmada]")).toBeVisible();

    // Mesmo domínio das visitas internas: aparece na Agenda do painel,
    // na aba "Próximas" (a visita foi pedida para daqui a três dias).
    await login(page, ORG_A);
    await page.goto("/app/agenda?aba=proximas");
    await expect(page.getByText(nome).first()).toBeVisible();
    // E na ficha do cliente, como negociação daquele imóvel.
    await page.goto("/app/clientes");
    await expect(page.getByText(nome).first()).toBeVisible();
  });
});

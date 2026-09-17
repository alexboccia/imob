import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E } from "./helpers";

// =======================================================================
// Compartilhar e Salvar na ficha (Fase 47)
// =======================================================================
// Compartilhar: menu com WhatsApp, Facebook, LinkedIn, X e Copiar link
// (ou a folha nativa, no celular), sempre com a URL canônica. Salvar:
// favorito no navegador, por organização. Nenhuma das duas ações fala
// com o servidor.

const BASE_W = "/e2e-org-recursos";
const SLUG_W = "e2e-org-recursos";
const fichaW = (id: string) => `${BASE_W}/imoveis/${id}`;
const FICHA = fichaW(IDS_E2E.imovelGaleria5);
const TITULO = "Imovel Galeria 5 E2E";
const DOBRA = 900;

const botaoCompartilhar = (page: Page) =>
  page.locator("[data-acoes-imovel]").getByRole("button", { name: "Compartilhar", exact: true });
const botaoSalvar = (page: Page) => page.locator("[data-salvar-imovel]");
const canonica = (page: Page) => page.locator('link[rel="canonical"]').getAttribute("href");
const chave = (slug: string) => `easymob:favoritos:v1:${slug}`;

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

function semDesktopShare(page: Page) {
  return page.addInitScript(() => {
    delete (window.navigator as unknown as { share?: unknown }).share;
  });
}

/**
 * Escritas que a página faz no PRÓPRIO servidor a partir de agora (POST:
 * server actions, formulários). GETs de prefetch ficam de fora, e os
 * eventos de analytics são conferidos à parte (espionarBeacons), porque o
 * corpo do beacon é um Blob que o evento de request não expõe.
 */
function gravarRequisicoes(page: Page) {
  const pedidos: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.hostname !== "localhost" || r.method() === "GET") return;
    if (url.pathname === "/api/analytics/evento") return;
    pedidos.push(`${r.method()} ${url.pathname}`);
  });
  return pedidos;
}

/** Guarda o que a página tenta enviar por sendBeacon, sem enviar. */
function espionarBeacons(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as { __beacons: unknown[] };
    w.__beacons = [];
    navigator.sendBeacon = (_url: string | URL, dados?: BodyInit | null) => {
      w.__beacons.push(dados);
      return true;
    };
  });
}

/** Tipos de evento de analytics que a página tentou enviar. */
function tiposDeEvento(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const w = window as unknown as { __beacons: (Blob | string)[] };
    const corpos = await Promise.all(
      w.__beacons.map((b) => (typeof b === "string" ? b : b.text()))
    );
    return corpos.map((c) => JSON.parse(c).type as string);
  });
}

// -----------------------------------------------------------------------
// Salvar
// -----------------------------------------------------------------------
test.describe("salvar", () => {
  test("A–E) Salvar → Salvo, sobrevive ao refresh, remover também", async ({ page }) => {
    await espionarBeacons(page);
    await page.goto(FICHA);
    const salvar = botaoSalvar(page);
    await expect(salvar).toHaveText("Salvar nos favoritos");
    await expect(salvar).toHaveAttribute("aria-pressed", "false");
    await expect(salvar).toHaveAccessibleName("Salvar nos favoritos");

    const pedidos = gravarRequisicoes(page);
    await salvar.click();
    await expect(salvar).toHaveAttribute("aria-pressed", "true");
    await expect(salvar).toHaveAccessibleName("Salvo nos favoritos");
    await expect(salvar.locator("svg")).toHaveAttribute("fill", "currentColor");
    expect(await page.evaluate((k) => localStorage.getItem(k), chave(SLUG_W))).toBe(
      JSON.stringify([IDS_E2E.imovelGaleria5])
    );
    // Nada foi ao servidor, e nenhum evento além da visualização.
    expect(pedidos).toEqual([]);
    expect((await tiposDeEvento(page)).filter((t) => t !== "PROPERTY_VIEW")).toEqual([]);

    await page.reload();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");
    await expect(botaoSalvar(page)).toHaveAccessibleName("Salvo nos favoritos");

    await botaoSalvar(page).click();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate((k) => localStorage.getItem(k), chave(SLUG_W))).toBe("[]");

    await page.reload();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "false");
    await expect(botaoSalvar(page)).toHaveAccessibleName("Salvar nos favoritos");
  });

  test("favoritos são por organização, mesmo com ids que colidem", async ({ page }) => {
    await page.goto(FICHA);
    await botaoSalvar(page).click();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");

    // Um id da Organização A gravado na lista da Organização W não vale lá.
    await page.evaluate(
      ([k, id]) => localStorage.setItem(k, JSON.stringify([...JSON.parse(localStorage.getItem(k)!), id])),
      [chave(SLUG_W), IDS_E2E.imovelComBadgesOrgA]
    );

    await page.goto(`/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "false");
    await botaoSalvar(page).click();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate((k) => localStorage.getItem(k), chave("e2e-org-a"))).toBe(
      JSON.stringify([IDS_E2E.imovelComBadgesOrgA])
    );
    // Remover na A não mexe na lista da W.
    await botaoSalvar(page).click();
    await page.goto(FICHA);
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");
    // Limpeza: deixa a lista da W como estava antes do teste.
    await botaoSalvar(page).click();
  });

  test("valor corrompido: a página abre, e salvar recupera sem apagar outras chaves", async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));
    await page.addInitScript(
      ([k]) => {
        if (!sessionStorage.getItem("semeado")) {
          localStorage.setItem(k, "não é JSON");
          localStorage.setItem("outra-aplicacao", "preservar");
          sessionStorage.setItem("semeado", "1");
        }
      },
      [chave(SLUG_W)]
    );
    await page.goto(FICHA);
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "false");
    await botaoSalvar(page).click();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate((k) => localStorage.getItem(k), chave(SLUG_W))).toBe(
      JSON.stringify([IDS_E2E.imovelGaleria5])
    );
    expect(await page.evaluate(() => localStorage.getItem("outra-aplicacao"))).toBe("preservar");
    await botaoSalvar(page).click();
    expect(erros).toEqual([]);
  });

  test("localStorage bloqueado: a página abre e o botão funciona durante a visita", async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("bloqueado", "SecurityError");
        },
      });
    });
    await page.goto(FICHA);
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "false");
    await botaoSalvar(page).click();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");
    await botaoSalvar(page).click();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "false");
    expect(erros).toEqual([]);
  });

  test("foco visível e ícone decorativo", async ({ page }) => {
    await page.goto(FICHA);
    const salvar = botaoSalvar(page);
    await salvar.focus();
    await expect(salvar).toBeFocused();
    expect(await salvar.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
    await expect(salvar.locator("svg")).toHaveAttribute("aria-hidden", "true");
    // Teclado alterna também.
    await page.keyboard.press("Enter");
    await expect(salvar).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Space");
    await expect(salvar).toHaveAttribute("aria-pressed", "false");
  });
});

// -----------------------------------------------------------------------
// Compartilhar
// -----------------------------------------------------------------------
test.describe("compartilhar (desktop)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await semDesktopShare(page);
  });

  test("menu: itens, teclado, Escape e clique fora", async ({ page }) => {
    await page.goto(FICHA);
    const botao = botaoCompartilhar(page);
    await expect(botao).toHaveAttribute("aria-haspopup", "menu");
    await expect(botao).toHaveAttribute("aria-expanded", "false");

    await botao.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(botao).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByText("Compartilhar imóvel")).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText([
      "WhatsApp (abre em nova aba)",
      "Facebook (abre em nova aba)",
      "LinkedIn (abre em nova aba)",
      "X (abre em nova aba)",
      "Copiar link",
    ]);
    // Ícones decorativos: nenhum fica exposto ao leitor de tela (ou o
    // próprio svg ou um ancestral é aria-hidden).
    const expostos = await menu
      .locator("svg")
      .evaluateAll((svgs) => svgs.filter((svg) => !svg.closest('[aria-hidden="true"]')).length);
    expect(expostos).toBe(0);

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(botao).toBeFocused();

    // Teclado: Enter abre, setas percorrem.
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("ArrowDown");
    const focado = () => page.evaluate(() => document.activeElement?.textContent?.trim());
    const primeiro = await focado();
    await page.keyboard.press("ArrowDown");
    expect(await focado()).not.toBe(primeiro);
    expect(["WhatsApp (abre em nova aba)", "Facebook (abre em nova aba)"]).toContain(primeiro);
    // Tab sai do menu e o fecha.
    await page.keyboard.press("Tab");
    await expect(menu).toBeHidden();

    // Clique fora fecha.
    await botao.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(5, 850);
    await expect(menu).toBeHidden();
  });

  test("cada rede recebe a URL canônica, em nova aba segura", async ({ page }) => {
    await page.goto(FICHA);
    const url = (await canonica(page))!;
    expect(url).toMatch(new RegExp(`${BASE_W}/imoveis/${IDS_E2E.imovelGaleria5}$`));
    // A mesma URL que a página anuncia para as redes.
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", url);

    await botaoCompartilhar(page).click();
    const item = (rede: string) => page.locator(`[data-rede="${rede}"]`);
    for (const rede of ["whatsapp", "facebook", "linkedin", "x"]) {
      await expect(item(rede)).toHaveAttribute("target", "_blank");
      const rel = (await item(rede).getAttribute("rel")) ?? "";
      expect(rel).toContain("noopener");
      expect(rel).toContain("noreferrer");
    }
    const href = async (rede: string) => new URL((await item(rede).getAttribute("href"))!);

    const wa = await href("whatsapp");
    expect(`${wa.origin}${wa.pathname}`).toBe("https://wa.me/");
    expect(wa.searchParams.get("text")).toBe(`Veja este imóvel: ${TITULO}\n${url}`);
    // Compartilhar não é falar com a imobiliária: nenhum número no link.
    expect(wa.pathname).toBe("/");

    expect((await href("facebook")).searchParams.get("u")).toBe(url);
    expect((await href("linkedin")).searchParams.get("url")).toBe(url);
    const x = await href("x");
    expect(x.searchParams.get("url")).toBe(url);
    expect(x.searchParams.get("text")).toBe(`Veja este imóvel: ${TITULO}`);

    // Nada de URL de admin, localhost de outra porta ou query/fragmento
    // da página atual.
    for (const rede of ["whatsapp", "facebook", "linkedin", "x"]) {
      const bruto = decodeURIComponent((await item(rede).getAttribute("href"))!);
      expect(bruto).not.toContain("/app/");
      expect(bruto).not.toContain("#");
    }
  });

  test("WhatsApp de compartilhamento: abre fora, sem nenhuma escrita nem evento de contato", async ({
    page,
    context,
  }) => {
    const externos: string[] = [];
    await context.route(/wa\.me/, (rota) => {
      externos.push(rota.request().url());
      return rota.abort();
    });
    await espionarBeacons(page);
    await page.goto(FICHA);
    const pedidos = gravarRequisicoes(page);
    await botaoCompartilhar(page).click();
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.locator('[data-rede="whatsapp"]').click(),
    ]);
    await popup.close();
    await expect.poll(() => externos.length).toBe(1);
    expect(new URL(externos[0]).searchParams.get("text")).toContain(TITULO);
    // Nenhum POST (server action, formulário) e nenhum evento além da
    // visualização — em especial, nenhum WHATSAPP_CLICK: compartilhar não
    // é contato comercial.
    expect(pedidos).toEqual([]);
    expect((await tiposDeEvento(page)).filter((t) => t !== "PROPERTY_VIEW")).toEqual([]);
    // A página de origem continua a ficha.
    await expect(page).toHaveURL(new RegExp(`${IDS_E2E.imovelGaleria5}$`));
  });

  test("Copiar link: clipboard recebe a URL canônica e o aviso é anunciado", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await espionarBeacons(page);
    await page.goto(FICHA);
    const pedidos = gravarRequisicoes(page);
    await botaoCompartilhar(page).click();
    await page.getByRole("menuitem", { name: "Copiar link" }).click();
    const aviso = page.locator("[data-aviso-compartilhar]");
    await expect(aviso).toHaveText("Link copiado");
    await expect(aviso).toHaveAttribute("role", "status");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await canonica(page));
    expect(pedidos).toEqual([]);
    expect((await tiposDeEvento(page)).filter((t) => t !== "PROPERTY_VIEW")).toEqual([]);
  });

  test("sem Clipboard API: cai no caminho antigo, sem erro", async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
      (window as unknown as { __copiado?: string }).__copiado = undefined;
      const original = document.execCommand.bind(document);
      document.execCommand = (comando: string, ...resto: unknown[]) => {
        if (comando === "copy") {
          (window as unknown as { __copiado?: string }).__copiado = (
            document.activeElement as HTMLTextAreaElement
          ).value;
          return true;
        }
        return original(comando, ...(resto as [boolean, string]));
      };
    });
    await page.goto(FICHA);
    await botaoCompartilhar(page).click();
    await page.getByRole("menuitem", { name: "Copiar link" }).click();
    await expect(page.locator("[data-aviso-compartilhar]")).toHaveText("Link copiado");
    expect(await page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado)).toBe(
      await canonica(page)
    );
    expect(erros).toEqual([]);
  });

  test("com folha nativa disponível, o desktop continua usando o menu", async ({ page }) => {
    await page.addInitScript(() => {
      (navigator as unknown as { share: unknown }).share = async () => {
        (window as unknown as { __nativo?: boolean }).__nativo = true;
      };
    });
    await page.goto(FICHA);
    await botaoCompartilhar(page).click();
    await expect(page.getByRole("menu")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __nativo?: boolean }).__nativo)).toBeUndefined();
  });
});

test.describe("compartilhar (celular)", () => {
  test("390px com folha nativa: abre a folha com título e URL canônica, sem menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.addInitScript(() => {
      (navigator as unknown as { share: unknown }).share = async (dados: unknown) => {
        (window as unknown as { __nativo?: unknown }).__nativo = dados;
      };
    });
    await page.goto(FICHA);
    await botaoCompartilhar(page).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __nativo?: unknown }).__nativo))
      .toEqual({ title: TITULO, text: `Veja este imóvel: ${TITULO}`, url: await canonica(page) });
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("390px sem folha nativa: o menu abre", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await semDesktopShare(page);
    await page.goto(FICHA);
    await botaoCompartilhar(page).click();
    await expect(page.getByRole("menu")).toBeVisible();
    // O menu cabe na tela.
    const menu = await caixa(page.getByRole("menu"));
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(390);
  });
});

// -----------------------------------------------------------------------
// Layout
// -----------------------------------------------------------------------
test.describe("faixa título + ações", () => {
  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: título longo inteiro, ações sem colisão, nada fora do conteúdo`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(fichaW(IDS_E2E.imovelTituloLongo));

      const coluna = await caixa(page.locator("[data-identidade-imovel]"));
      const h1 = page.getByRole("heading", { level: 1 });
      const titulo = await caixa(h1);
      const endereco = await caixa(page.getByText("Centro, São Paulo - SP", { exact: true }).first());
      const acoes = await caixa(page.locator("[data-acoes-imovel]"));
      const compartilhar = await caixa(botaoCompartilhar(page));
      const salvar = await caixa(botaoSalvar(page));

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      for (const b of [titulo, acoes]) {
        expect(b.x).toBeGreaterThanOrEqual(coluna.x - 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(coluna.x + coluna.width + 0.5);
      }
      const colide = (a: typeof titulo, b: typeof titulo) =>
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(colide(titulo, acoes)).toBe(false);
      expect(colide(endereco, acoes)).toBe(false);

      // Título nunca truncado: o texto inteiro está lá e não há corte.
      await expect(h1).toHaveText(/no coração de Santana$/);
      expect(await h1.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(await h1.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe("ellipsis");
      expect(titulo.height).toBeGreaterThan(40); // quebrou em várias linhas

      // Botões utilizáveis, lado a lado.
      for (const b of [compartilhar, salvar]) expect(b.height).toBeGreaterThanOrEqual(36);
      expect(Math.abs(compartilhar.y - salvar.y)).toBeLessThan(1);
      expect(salvar.x).toBeGreaterThan(compartilhar.x);

      if (largura >= 1024) {
        // À direita do título, alinhadas ao topo dele.
        expect(acoes.x).toBeGreaterThanOrEqual(titulo.x + titulo.width);
        expect(Math.abs(acoes.y - titulo.y)).toBeLessThan(8);
      } else {
        expect(acoes.y).toBeGreaterThanOrEqual(endereco.y + endereco.height);
        if (largura < 768) for (const b of [compartilhar, salvar]) expect(b.height).toBeGreaterThanOrEqual(40);
      }
    });
  }

  for (const largura of [1280, 1440]) {
    test(`${largura}px: a faixa não tira preço, ação e galeria da primeira dobra`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(fichaW(IDS_E2E.imovelEditorialCompleto));
      const bloco = page.locator("[data-bloco-comercial]");
      for (const alvo of [
        page.getByRole("heading", { level: 1 }),
        page.locator("[data-acoes-imovel]"),
        bloco.locator('[data-preco="venda"]'),
        bloco.getByRole("link", { name: "Tenho interesse" }),
        page.locator("[data-foto-principal] [data-ver-galeria]"),
      ]) {
        const b = await caixa(alvo);
        expect(b.y + b.height).toBeLessThanOrEqual(DOBRA);
      }
      // Referência da Fase 46 com o mesmo fixture: preço até 199, galeria
      // em 267. As ações dividem a linha do título e não somam altura.
      const preco = await caixa(bloco.locator('[data-preco="venda"]'));
      expect(preco.y + preco.height).toBeLessThanOrEqual(199);
      expect((await caixa(page.locator("[data-galeria-hero]"))).y).toBeLessThanOrEqual(267);
    });
  }
});

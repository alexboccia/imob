import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E } from "./helpers";

// =======================================================================
// Breadcrumb comercial da ficha (Fase 46)
// =======================================================================
// Caminho (nav > ol) com listagens públicas que já existem, e, ao lado,
// selos de situação (rótulos, obra, código) — que NÃO são navegação.

const BASE_W = "/e2e-org-recursos";
const fichaW = (id: string) => `${BASE_W}/imoveis/${id}`;
const DOBRA = 900;
const LARGURAS = [320, 390, 768, 1024, 1280, 1440];

const nav = (page: Page) => page.getByRole("navigation", { name: "Breadcrumb" });
const selos = (page: Page) => page.getByRole("list", { name: "Situação do imóvel" });
const contexto = (page: Page) => page.locator("[data-contexto-imovel]");

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

async function migalhas(page: Page) {
  return nav(page)
    .locator("ol > li")
    .evaluateAll((lis) =>
      lis.map((li) => {
        const a = li.querySelector("a")!;
        return { label: a.textContent!.trim(), href: a.getAttribute("href")! };
      })
    );
}

const textosDosSelos = (page: Page) =>
  selos(page).locator("li").evaluateAll((lis) => lis.map((li) => li.textContent!.trim()));

const params = (href: string) => Object.fromEntries(new URL(href, "http://x.test").searchParams);
const caminho = (href: string) => new URL(href, "http://x.test").pathname;

// -----------------------------------------------------------------------
// Composição
// -----------------------------------------------------------------------
test.describe("composição", () => {
  test("A) lançamento em construção: Home > Lançamentos > Apartamento > Santana + selos", async ({ page }) => {
    await page.goto(fichaW(IDS_E2E.imovelBreadcrumbLancamento));
    const m = await migalhas(page);
    expect(m.map((x) => x.label)).toEqual(["Home", "Lançamentos", "Apartamento", "Santana"]);
    expect(m[0].href).toBe(BASE_W);
    expect(m[1].href).toBe(`${BASE_W}/imoveis?lancamento=1`);
    expect(caminho(m[2].href)).toBe(`${BASE_W}/imoveis`);
    expect(params(m[2].href)).toEqual({ lancamento: "1", tipo: "Apartamento" });
    expect(params(m[3].href)).toEqual({
      lancamento: "1",
      tipo: "Apartamento",
      cidade: "São Paulo",
      bairro: "Santana",
    });

    const textos = await textosDosSelos(page);
    expect(textos.slice(0, 2)).toEqual(["Lançamento", "Em construção"]);
    expect(textos).toHaveLength(3);
    // Código público (Property.code, com prefixo quando houver) — nunca
    // o id interno do banco.
    expect(textos[2]).toMatch(/^Código: [A-Za-z0-9-]+$/);
    expect(textos[2]).not.toContain(IDS_E2E.imovelBreadcrumbLancamento);

    // A previsão de entrega não entra na faixa (fica no hero e na linha
    // de lançamento).
    await expect(contexto(page).getByText(/Entrega prevista|Previsão/)).toHaveCount(0);
  });

  test("B) casa pronta, não lançamento: Comprar e 'Pronto para morar', sem 'Lançamento'", async ({ page }) => {
    await page.goto(fichaW(IDS_E2E.imovelBreadcrumbCasa));
    const m = await migalhas(page);
    expect(m.map((x) => x.label)).toEqual(["Home", "Comprar", "Casa", "Moema"]);
    expect(m[1].href).toBe(`${BASE_W}/imoveis?finalidade=SALE`);
    const textos = await textosDosSelos(page);
    expect(textos).not.toContain("Lançamento");
    expect(textos).not.toContain("Usado");
    expect(textos.slice(0, 1)).toEqual(["Pronto para morar"]);
    await expect(nav(page).getByText("Lançamentos")).toHaveCount(0);
  });

  test("F) aluguel sem estágio: Alugar, e nenhum selo de obra inventado", async ({ page }) => {
    await page.goto(fichaW(IDS_E2E.imovelBreadcrumbAluguel));
    const m = await migalhas(page);
    expect(m.map((x) => x.label)).toEqual(["Home", "Alugar", "Studio", "Pinheiros"]);
    expect(params(m[3].href)).toEqual({
      finalidade: "RENT",
      tipo: "Studio",
      cidade: "São Paulo",
      bairro: "Pinheiros",
    });
    await expect(selos(page).locator('[data-selo="obra"]')).toHaveCount(0);
    const textos = await textosDosSelos(page);
    expect(textos).toHaveLength(1);
    expect(textos[0]).toMatch(/^Código: /);
  });

  test("venda e locação: sobe para a listagem geral (Imóveis)", async ({ page }) => {
    await page.goto(fichaW(IDS_E2E.imovelBreadcrumbVendaLocacao));
    const m = await migalhas(page);
    expect(m.map((x) => x.label)).toEqual(["Home", "Imóveis", "Apartamento", "Tatuapé"]);
    expect(m[1].href).toBe(`${BASE_W}/imoveis`);
    expect(params(m[2].href)).toEqual({ tipo: "Apartamento" });
  });

  test("C/D) sem bairro e sem tipo: os níveis somem, sem placeholder", async ({ page }) => {
    await page.goto(fichaW(IDS_E2E.imovelBreadcrumbSemContexto));
    const m = await migalhas(page);
    expect(m.map((x) => x.label)).toEqual(["Home", "Comprar", "São Paulo"]);
    expect(params(m[2].href)).toEqual({ finalidade: "SALE", cidade: "São Paulo" });
    expect(await contexto(page).innerText()).not.toMatch(/não informad|sem tipo|sem bairro|—|undefined|null/i);
    const textos = await textosDosSelos(page);
    expect(textos).toHaveLength(1);
    expect(textos[0]).toMatch(/^Código: /);
  });

  test("rótulos comerciais continuam como selos (Destaque, Oportunidade)", async ({ page }) => {
    await page.goto(`/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    const textos = await textosDosSelos(page);
    expect(textos.slice(0, 4)).toEqual(["Lançamento", "Destaque", "Oportunidade", "Em construção"]);
    // E cada informação aparece UMA vez no topo: nada de "Obra:" ou
    // "Cód." repetidos no cabeçalho.
    const topo = contexto(page).locator("xpath=..");
    await expect(topo.getByText("Em construção", { exact: true })).toHaveCount(1);
    await expect(topo.getByText(/^Cód\./)).toHaveCount(0);
    await expect(topo.getByText("Obra:")).toHaveCount(0);
  });

  test("o selo de entrega da Fase 45 continua na galeria, não na faixa", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(fichaW(IDS_E2E.imovelEditorialCompleto));
    await expect(page.locator("[data-foto-principal] [data-selo-entrega]")).toContainText("Nov/2027");
    await expect(contexto(page).locator("[data-selo-entrega]")).toHaveCount(0);
    await expect(contexto(page).getByText("Nov/2027")).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------
// Links reais e tenant
// -----------------------------------------------------------------------
test.describe("links", () => {
  test("cada nível responde 200, fica na organização e lista o imóvel", async ({ page, request }) => {
    await page.goto(fichaW(IDS_E2E.imovelBreadcrumbLancamento));
    const m = await migalhas(page);
    for (const { href } of m) {
      expect(href.startsWith(BASE_W)).toBe(true);
      const r = await request.get(href);
      expect(r.status(), href).toBe(200);
    }
    // Lançamentos, tipo e bairro trazem este imóvel; o bairro filtra de
    // verdade (a casa de Moema, da mesma organização, não aparece).
    for (const { href } of m.slice(1)) {
      await page.goto(href);
      await expect(page.getByText("Imovel Breadcrumb Lancamento E2E").first()).toBeVisible();
    }
    await expect(page.getByText("Imovel Breadcrumb Casa E2E")).toHaveCount(0);

    // Home leva à home DESTA organização.
    await page.goto(fichaW(IDS_E2E.imovelBreadcrumbLancamento));
    await nav(page).getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE_W}$`));
    await expect(page.locator("header").getByText("Organização E2E Recursos").first()).toBeVisible();
  });

  test("organização do domínio principal: links sem prefixo, e continuam nela", async ({ page, request }) => {
    await page.goto(`/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    const m = await migalhas(page);
    expect(m[0].href).toBe("/");
    expect(m[1].href).toBe("/imoveis?lancamento=1");
    for (const { href } of m) expect((await request.get(href)).status(), href).toBe(200);
    await nav(page).getByRole("link", { name: "Lançamentos" }).click();
    await expect(page).toHaveURL(/\/imoveis\?lancamento=1$/);
    await expect(page.locator("header").getByText("Organização E2E A").first()).toBeVisible();
    // Nenhum imóvel da Organização W nessa listagem.
    await expect(page.getByText("Imovel Breadcrumb Lancamento E2E")).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------
// Acessibilidade
// -----------------------------------------------------------------------
test.describe("acessibilidade", () => {
  test("nav com ol/li, separadores ocultos, selos fora da navegação, foco e contraste", async ({ page }) => {
    await page.goto(fichaW(IDS_E2E.imovelBreadcrumbLancamento));
    await expect(nav(page)).toHaveCount(1);
    await expect(nav(page).locator("ol")).toHaveCount(1);
    await expect(nav(page).locator("ol > li")).toHaveCount(4);
    // Separadores: 3, todos decorativos, e nenhum texto ">" solto.
    await expect(nav(page).locator("svg")).toHaveCount(3);
    await expect(nav(page).locator('svg:not([aria-hidden="true"])')).toHaveCount(0);
    expect(await nav(page).innerText()).not.toContain(">");
    // A última migalha é uma listagem, não esta página.
    await expect(nav(page).locator("[aria-current]")).toHaveCount(0);

    // Selos: fora do nav, sem links nem botões.
    await expect(nav(page).locator("[data-selo]")).toHaveCount(0);
    await expect(selos(page).getByRole("link")).toHaveCount(0);
    await expect(selos(page).getByRole("button")).toHaveCount(0);

    // Foco visível no link.
    const link = nav(page).getByRole("link", { name: "Apartamento" });
    await link.focus();
    await expect(link).toBeFocused();
    expect(await link.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");

    // Contraste do texto das migalhas (AA, texto normal).
    const razao = await link.evaluate((el) => {
      const rgb = (s: string) => s.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (c: number) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const texto = lum(rgb(getComputedStyle(el).color));
      const fundo = lum([255, 255, 255]);
      return (Math.max(texto, fundo) + 0.05) / (Math.min(texto, fundo) + 0.05);
    });
    expect(razao).toBeGreaterThanOrEqual(4.5);
  });
});

// -----------------------------------------------------------------------
// Responsivo e primeira dobra
// -----------------------------------------------------------------------
test.describe("responsivo", () => {
  for (const largura of LARGURAS) {
    test(`${largura}px: sem overflow, dentro do conteúdo, sem colisão, compacto`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(fichaW(IDS_E2E.imovelBreadcrumbLancamento));

      const faixa = await caixa(contexto(page));
      const container = await caixa(contexto(page).locator("xpath=.."));
      const h1 = await caixa(page.getByRole("heading", { level: 1 }));
      const n = await caixa(nav(page));
      const s = await caixa(selos(page));

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      // Alinhado ao conteúdo (mesmo container e mesmo x do título).
      expect(Math.abs(faixa.x - h1.x)).toBeLessThan(1);
      for (const b of [n, s]) {
        expect(b.x).toBeGreaterThanOrEqual(container.x - 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(container.x + container.width + 0.5);
      }
      // Caminho e selos não se sobrepõem; e a faixa fica acima do título.
      const colide = n.x < s.x + s.width && s.x < n.x + n.width && n.y < s.y + s.height && s.y < n.y + n.height;
      expect(colide).toBe(false);
      expect(faixa.y + faixa.height).toBeLessThanOrEqual(h1.y);

      // Nenhum link cortado, texto legível.
      for (const item of await nav(page).locator("ol > li").all()) {
        const b = await caixa(item);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(largura);
        // O item (inline-flex) mostra o texto inteiro, sem corte.
        expect(await item.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }
      const fonte = await nav(page).locator("ol").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(fonte).toBeGreaterThanOrEqual(13);

      // Compacto: uma linha no desktop; quebras naturais no celular.
      if (largura >= 1024) {
        expect(faixa.height).toBeLessThanOrEqual(28);
        expect(Math.abs(n.y + n.height / 2 - (s.y + s.height / 2))).toBeLessThan(4);
      } else {
        // Sem espaço sobrando: a faixa é o caminho, um vão e os selos.
        expect(faixa.height).toBeLessThanOrEqual(n.height + s.height + 8 + 1);
      }
      // Em qualquer largura, no máximo duas linhas para o caminho e duas
      // para os selos (linha de 20px + vão).
      expect(n.height).toBeLessThanOrEqual(2 * 20 + 4 + 1);
      expect(s.height).toBeLessThanOrEqual(2 * 20 + 6 + 1);
    });
  }

  for (const largura of [1280, 1440]) {
    test(`${largura}px: a faixa não tira título, ações e galeria da primeira dobra`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(fichaW(IDS_E2E.imovelEditorialCompleto));
      const alvos = [
        contexto(page),
        page.getByRole("heading", { level: 1 }),
        page.locator("[data-acoes-imovel]"),
        page.locator("[data-foto-principal] [data-ver-galeria]"),
      ];
      for (const alvo of alvos) {
        const b = await caixa(alvo);
        expect(b.y + b.height).toBeLessThanOrEqual(DOBRA);
      }
      // A faixa soma só a própria altura (uma linha compacta) e o
      // espaçamento até o título — nada além disso empurra a página. As
      // medidas são relativas: pixels absolutos de uma máquina não valem
      // no CI, onde a fonte quebra o título em outro ponto.
      const faixa = await caixa(contexto(page));
      const h1 = await caixa(page.getByRole("heading", { level: 1 }));
      expect(faixa.height).toBeLessThanOrEqual(28);
      expect(h1.y - (faixa.y + faixa.height)).toBeGreaterThanOrEqual(0);
      expect(h1.y - (faixa.y + faixa.height)).toBeLessThanOrEqual(16);
      const galeria = await caixa(page.locator("[data-galeria-hero]"));
      expect(DOBRA - galeria.y).toBeGreaterThanOrEqual(500);
    });
  }
});

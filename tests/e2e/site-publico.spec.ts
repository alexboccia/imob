import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// Redesign do site público (Proposta 2) — roda no host padrão (sem
// prefixo de slug: PUBLIC_ORG_SLUG=e2e-org-a em .env.test), já seedado
// com 2 imóveis AVAILABLE: "Apartamento com 2 quartos à venda, 58m² –
// Santo Amaro" (isLaunch/isFeatured/isOpportunity = true, aparece nas 3
// seções da Home) e "Apartamento E2E para edição" (sem badges, só
// aparece na listagem geral/busca). Ver prisma/seed-e2e.ts.
const IMOVEL_COM_BADGES = "Apartamento com 2 quartos à venda, 58m² – Santo Amaro";

async function semOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

test.describe("Site público — Home (Proposta 2)", () => {
  test("renderiza header, hero e painel de busca", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Encontre o imóvel ideal para você" })).toBeVisible();
    await expect(page.getByText("Apartamentos, casas e imóveis comerciais selecionados para você.")).toBeVisible();

    // Comprar/Alugar + campos reais do painel de busca.
    await expect(page.getByRole("button", { name: "Comprar", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Alugar", exact: true })).toBeVisible();
    await expect(page.getByLabel("Cidade", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Bairro", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Tipo de imóvel")).toBeVisible();
    // Aba padrão é Comprar — último campo é "Valor até".
    await expect(page.getByLabel("Valor até")).toBeVisible();
    await expect(page.getByRole("button", { name: "Buscar imóveis" })).toBeVisible();
  });

  test("menu principal tem as rotas reais (Comprar/Alugar/Lançamentos)", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("header nav");
    await expect(nav.getByRole("link", { name: "Comprar" })).toHaveAttribute("href", /finalidade=SALE/);
    await expect(nav.getByRole("link", { name: "Alugar" })).toHaveAttribute("href", /finalidade=RENT/);
    await expect(nav.getByRole("link", { name: "Lançamentos" })).toHaveAttribute("href", /lancamento=1/);
  });

  test("Lançamentos, Destaques e Oportunidades mostram o imóvel com os 3 badges; 'Ver tudo' aponta pro filtro certo", async ({
    page,
  }) => {
    await page.goto("/");

    for (const { titulo, hrefParte } of [
      { titulo: "Lançamentos", hrefParte: "lancamento=1" },
      { titulo: "Destaques", hrefParte: "destaque=1" },
      { titulo: "Oportunidades", hrefParte: "oportunidade=1" },
    ]) {
      const secao = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: titulo }) });
      await expect(secao.getByText(IMOVEL_COM_BADGES, { exact: true })).toBeVisible();
      // role="button" (não "link"): Button com render={<Link/>} preserva
      // role="button" mesmo composto sobre uma <a> de verdade — mesmo
      // achado documentado em imoveis.spec.ts pro botão "+ Novo imóvel".
      await expect(secao.getByRole("button", { name: "Ver tudo" })).toHaveAttribute("href", new RegExp(hrefParte));
    }
  });

  test("Comprar leva pra listagem filtrada por venda", async ({ page }) => {
    await page.goto("/");
    await page.locator("header nav").getByRole("link", { name: "Comprar" }).click();
    await page.waitForURL(/finalidade=SALE/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Resultados da busca");
  });

  test("painel de busca da Home (Comprar): cidade + bairro + tipo + valor até geram a URL certa e filtram de verdade", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Cidade", { exact: true }).click();
    await page.getByLabel("Cidade", { exact: true }).fill("São");
    await page.getByRole("option", { name: "São Paulo" }).click();

    await page.getByLabel("Bairro", { exact: true }).click();
    await page.getByLabel("Bairro", { exact: true }).fill("Centro");
    await page.getByRole("option", { name: "Centro" }).click();

    await page.getByLabel("Tipo de imóvel").click();
    await page.getByRole("option", { name: "Apartamento", exact: true }).click();

    await page.getByLabel("Valor até").fill("900000");
    await page.getByRole("button", { name: "Buscar imóveis" }).click();

    await page.waitForURL(/\/imoveis\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get("finalidade")).toBe("SALE");
    expect(url.searchParams.get("cidade")).toBe("São Paulo");
    expect(url.searchParams.get("bairro")).toBe("Centro");
    expect(url.searchParams.get("tipo")).toBe("Apartamento");
    expect(url.searchParams.get("precoMax")).toBe("900000");
    // Resultado real: o imóvel de venda seedado (price=500000, São
    // Paulo/Centro/Apartamento) atende todos os critérios.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Resultados da busca");
    await expect(page.getByText("Nenhum imóvel encontrado")).toHaveCount(0);
  });

  test("painel de busca da Home (Alugar): rótulo do valor muda pra 'Aluguel até' e filtra por rentPrice, nunca por price de venda", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Alugar", exact: true }).click();
    await expect(page.getByLabel("Aluguel até")).toBeVisible();
    await expect(page.getByLabel("Valor até")).toHaveCount(0);

    await page.getByLabel("Cidade", { exact: true }).click();
    await page.getByLabel("Cidade", { exact: true }).fill("Campinas");
    await page.getByRole("option", { name: "Campinas" }).click();
    await page.getByLabel("Aluguel até").fill("3000");
    await page.getByRole("button", { name: "Buscar imóveis" }).click();

    await page.waitForURL(/\/imoveis\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get("finalidade")).toBe("RENT");
    expect(url.searchParams.get("cidade")).toBe("Campinas");
    expect(url.searchParams.get("precoMax")).toBe("3000");
    // Prova real do bug corrigido: o imóvel de aluguel seedado
    // (rentPrice=2500, price=null, Campinas/Cambuí) aparece — se o filtro
    // ainda estivesse aplicando em `price` (nulo pra este imóvel), o
    // resultado viria vazio.
    await expect(page.getByText("Apartamento para alugar, 45m² – Cambuí")).toBeVisible();
  });

  test("cidade → bairro: trocar de cidade limpa um bairro que não pertence mais a ela", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByPlaceholder("Selecione uma cidade primeiro")).toBeVisible();

    await page.getByLabel("Cidade", { exact: true }).click();
    await page.getByLabel("Cidade", { exact: true }).fill("São Paulo");
    await page.getByRole("option", { name: "São Paulo" }).click();
    await page.getByLabel("Bairro", { exact: true }).click();
    await page.getByLabel("Bairro", { exact: true }).fill("Centro");
    await page.getByRole("option", { name: "Centro" }).click();
    await expect(page.getByLabel("Bairro", { exact: true })).toHaveValue("Centro");

    // Troca de cidade — bairro de São Paulo não existe em Campinas,
    // então precisa ser limpo (não pode viajar silenciosamente no form).
    await page.getByLabel("Cidade", { exact: true }).click();
    await page.getByLabel("Cidade", { exact: true }).fill("");
    await page.getByLabel("Cidade", { exact: true }).fill("Campinas");
    await page.getByRole("option", { name: "Campinas" }).click();
    await expect(page.getByLabel("Bairro", { exact: true })).toHaveValue("");
  });

  test("bairro fica desabilitado até uma cidade ser escolhida", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Bairro", { exact: true })).toBeDisabled();
    await page.getByLabel("Cidade", { exact: true }).click();
    await page.getByLabel("Cidade", { exact: true }).fill("São Paulo");
    await page.getByRole("option", { name: "São Paulo" }).click();
    await expect(page.getByLabel("Bairro", { exact: true })).toBeEnabled();
  });

  test("tipo de imóvel: dropdown agrupa por Residencial/Comercial (catálogo real do tenant)", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Tipo de imóvel").click();
    await expect(page.getByRole("group", { name: "Residencial" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Comercial" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Apartamento", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Sala Comercial" })).toBeVisible();
  });

  test("'Todos os imóveis' (padrão do Tipo) não envia parâmetro tipo na URL", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Buscar imóveis" }).click();
    await page.waitForURL(/\/imoveis/);
    const url = new URL(page.url());
    expect(url.searchParams.has("tipo")).toBe(false);
  });

  test("cidade: navegação por teclado (ArrowDown + Enter) seleciona uma opção", async ({ page }) => {
    await page.goto("/");
    const campo = page.getByLabel("Cidade", { exact: true });
    await campo.click();
    await campo.fill("a"); // vogal presente em ambas as cidades seedadas
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    // Alguma das duas cidades reais foi selecionada — nunca um texto
    // arbitrário fora da lista de opções.
    const valor = await campo.inputValue();
    expect(["São Paulo", "Campinas"]).toContain(valor);
  });

  test("cidade: Escape fecha o dropdown sem alterar a seleção", async ({ page }) => {
    await page.goto("/");
    const campo = page.getByLabel("Cidade", { exact: true });
    await campo.click();
    await campo.fill("São");
    await expect(page.getByRole("option", { name: "São Paulo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("option", { name: "São Paulo" })).toBeHidden();
  });

  test("cidade sem resultado mostra mensagem amigável, sem quebrar", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Cidade", { exact: true }).click();
    await page.getByLabel("Cidade", { exact: true }).fill("Cidade Que Nao Existe Em Lugar Nenhum");
    await expect(page.getByText("Nenhuma cidade encontrada.")).toBeVisible();
  });

  test("card de imóvel leva pro detalhe", async ({ page }) => {
    await page.goto("/");
    await page.getByText(IMOVEL_COM_BADGES, { exact: true }).first().click();
    await page.waitForURL(/\/imoveis\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name: IMOVEL_COM_BADGES })).toBeVisible();
  });
});

test.describe("Site público — navegação mobile", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("hamburger abre o menu, navega e fecha", async ({ page }) => {
    await page.goto("/");
    const hamburguer = page.getByRole("button", { name: "Abrir menu" });
    await expect(hamburguer).toBeVisible();
    await hamburguer.click();

    const menu = page.locator("header nav").last();
    await expect(menu.getByRole("link", { name: "Alugar" })).toBeVisible();
    await menu.getByRole("link", { name: "Alugar" }).click();
    await page.waitForURL(/finalidade=RENT/);
  });
});

test.describe("Site público — listagem e detalhe", () => {
  // Só verifica o imóvel com badges por título exato — a outra fixture
  // fixa (imovelParaEditarOrgA) é renomeada por imoveis.spec.ts ("edita
  // um imóvel existente") ao rodar a suíte completa, e outros specs
  // (ex: "cria um imóvel") deixam imóveis novos publicados sem limpeza
  // própria — depender de um título ou de uma contagem exata aqui seria
  // frágil entre specs. ">= 2" ainda prova que a listagem pública reflete
  // dados reais (nunca zerada), sem acoplar a este teste a fixtures de
  // outras telas.
  test("listagem mostra os imóveis reais, com contagem coerente", async ({ page }) => {
    await page.goto("/imoveis");
    await expect(page.getByText(IMOVEL_COM_BADGES, { exact: true })).toBeVisible();
    const contador = await page.getByText(/imóve(l|is) encontrado/).textContent();
    const total = Number(contador?.match(/\d+/)?.[0] ?? 0);
    expect(total).toBeGreaterThanOrEqual(2);
  });

  test("detalhe do imóvel mostra título, preço e formulário de contato", async ({ page }) => {
    await page.goto("/imoveis");
    await page.getByText(IMOVEL_COM_BADGES, { exact: true }).first().click();
    await page.waitForURL(/\/imoveis\/[^/]+$/);

    await expect(page.getByRole("heading", { level: 1, name: IMOVEL_COM_BADGES })).toBeVisible();
    await expect(page.getByText("R$ 500.000", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Falar no WhatsApp" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeVisible();
  });
});

test.describe("Site público — responsividade (360/375/768/1024/1440)", () => {
  const BREAKPOINTS = [360, 375, 768, 1024, 1440];

  for (const width of BREAKPOINTS) {
    test(`Home ${width}px: sem overflow horizontal, hero e painel de busca legíveis`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");

      expect(await semOverflow(page), `Home @ ${width}px`).toBe(true);
      await expect(page.getByRole("heading", { level: 1, name: "Encontre o imóvel ideal para você" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Buscar imóveis" })).toBeVisible();

      if (width < 640) {
        await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
      } else {
        await expect(page.locator("header nav").first().getByRole("link", { name: "Comprar" })).toBeVisible();
      }
    });

    test(`Home ${width}px: dropdown de Cidade e de Tipo abertos não causam overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");

      await page.getByLabel("Cidade", { exact: true }).click();
      await page.getByLabel("Cidade", { exact: true }).fill("a");
      await expect(page.getByRole("option").first()).toBeVisible();
      expect(await semOverflow(page), `Home @ ${width}px com dropdown de Cidade aberto`).toBe(true);
      await page.keyboard.press("Escape");

      await page.getByLabel("Tipo de imóvel").click();
      await expect(page.getByRole("option").first()).toBeVisible();
      expect(await semOverflow(page), `Home @ ${width}px com dropdown de Tipo aberto`).toBe(true);
    });

    test(`Listagem ${width}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/imoveis");
      expect(await semOverflow(page), `Listagem @ ${width}px`).toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });

    test(`Detalhe ${width}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/imoveis");
      await page.getByText(IMOVEL_COM_BADGES, { exact: true }).first().click();
      await page.waitForURL(/\/imoveis\/[^/]+$/);
      await page.setViewportSize({ width, height: 900 });
      expect(await semOverflow(page), `Detalhe @ ${width}px`).toBe(true);
      await expect(page.getByRole("heading", { level: 1, name: IMOVEL_COM_BADGES })).toBeVisible();
    });
  }
});

// Correção — painel de busca vertical DENTRO do hero (texto à esquerda,
// card à direita em desktop), não mais uma barra horizontal abaixo dele.
// Estrutural (bounding boxes), não pixel-exato: só prova que headline e
// painel coexistem lado a lado a partir do breakpoint lg (1024px) e
// empilham abaixo dele — mesma lógica geométrica usada pelo restante da
// suíte de responsividade neste projeto.
test.describe("Site público — Hero + painel de busca (Proposta 2, correção)", () => {
  test("desktop (1440px): headline e painel de busca coexistem lado a lado, painel dentro do hero", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const headline = page.getByRole("heading", { level: 1, name: "Encontre o imóvel ideal para você" });
    // Topo do card (não o botão "Buscar imóveis", que fica no rodapé de
    // um card alto — comparar sua posição Y com a da headline não prova
    // nada sobre "lado a lado", já que um card vertical alto naturalmente
    // termina bem mais abaixo).
    const painelTopo = page.getByLabel("Bairro", { exact: true });
    const [boxHeadline, boxPainelTopo] = await Promise.all([headline.boundingBox(), painelTopo.boundingBox()]);

    expect(boxHeadline).not.toBeNull();
    expect(boxPainelTopo).not.toBeNull();
    // Lado a lado: o topo do painel fica à direita de onde a headline
    // termina, e sua linha de base está dentro da faixa vertical da
    // headline (mesma composição horizontal, não empilhado abaixo dela).
    expect(boxPainelTopo!.x).toBeGreaterThan(boxHeadline!.x + boxHeadline!.width);
    expect(boxPainelTopo!.y).toBeLessThan(boxHeadline!.y + boxHeadline!.height);
  });

  test("mobile (375px): painel empilha abaixo da headline, full-width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/");

    const headline = page.getByRole("heading", { level: 1, name: "Encontre o imóvel ideal para você" });
    const painel = page.getByRole("button", { name: "Buscar imóveis" });
    const [boxHeadline, boxPainel] = await Promise.all([headline.boundingBox(), painel.boundingBox()]);

    expect(boxHeadline).not.toBeNull();
    expect(boxPainel).not.toBeNull();
    // Empilhado: painel começa abaixo de onde a headline termina, nunca
    // ao lado.
    expect(boxPainel!.y).toBeGreaterThan(boxHeadline!.y + boxHeadline!.height);
    // Praticamente full-width (mesma largura ~ viewport menos padding),
    // não uma coluna estreita espremida ao lado de outra coisa.
    expect(boxPainel!.width).toBeGreaterThan(300);
  });
});

// Correção — footer escuro com logo/nome, links reais e redes sociais
// (quando configuradas), em vez do footer branco simples anterior.
test.describe("Site público — Footer (Proposta 2, correção)", () => {
  test("mostra nome/logo, links reais (incluindo Contato) e copyright", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();

    await expect(footer.getByText("Organização E2E A", { exact: true })).toBeVisible();
    for (const label of ["Comprar", "Alugar", "Lançamentos", "Contato"]) {
      await expect(footer.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(footer.getByText(/Todos os direitos reservados/)).toBeVisible();

    // Fundo escuro (não branco) — checagem estrutural via computed style,
    // não um valor de cor exato (o objetivo é "escuro", não uma hex
    // específica). getComputedStyle pode devolver oklch/lab() dependendo
    // do browser — normaliza via canvas 2D (fillStyle sempre volta como
    // #rrggbb/rgba, independente da notação de origem) antes de medir
    // luminosidade.
    const luminosidade = await footer.evaluate((el) => {
      const corFundo = getComputedStyle(el).backgroundColor;
      // 1x1 canvas real: pinta com a cor computada (qualquer notação —
      // rgb/oklch/lab) e lê o pixel já rasterizado de volta em sRGB
      // 0-255 — normalização robusta, não depende de fillStyle
      // simplificar pra uma string hex específica.
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = corFundo;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return (r + g + b) / 3;
    });
    expect(luminosidade, `luminosidade média do fundo do footer: ${luminosidade}`).toBeLessThan(80);
  });

  test("link Contato do footer navega pra rota real", async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").getByRole("link", { name: "Contato" }).click();
    await page.waitForURL(/\/contato$/);
    await expect(page.getByRole("heading", { level: 1, name: "Contato" })).toBeVisible();
  });

  for (const width of [360, 1440]) {
    test(`footer ${width}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      expect(await semOverflow(page), `Footer @ ${width}px`).toBe(true);
      await expect(page.locator("footer")).toBeVisible();
    });
  }
});

// Configurações → Rodapé do site (aparência): a escolha em
// /app/configuracoes precisa realmente refletir no fundo do footer do
// site público, não só persistir no formulário (isso já é coberto em
// configuracoes.spec.ts). Verifica o valor ESPECIFICADO de
// backgroundColor (el.style, não getComputedStyle) — AUTO/PRIMARY usam
// color-mix()/var(--primary) inline (ver SiteFooter.tsx), então o valor
// bruto identifica o modo sem depender de resolver cor calculada,
// evitando o mesmo tipo de fragilidade de parse já visto no teste de
// luminosidade acima.
test.describe("Site público — Footer aparência (rodapé)", () => {
  test("PRIMARY e LIGHT mudam o fundo do footer público; AUTO (padrão) volta a color-mix", async ({ page }) => {
    async function estiloFundoFooter() {
      await page.goto("/");
      return page.locator("footer").evaluate((el) => (el as HTMLElement).style.backgroundColor);
    }

    // Padrão (AUTO) antes de qualquer alteração.
    expect(await estiloFundoFooter()).toContain("color-mix");

    await login(page, ORG_A);

    await page.goto("/app/configuracoes");
    await page.getByRole("radio", { name: /Cor principal do tema/i }).check({ force: true });
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();
    expect(await estiloFundoFooter()).toBe("var(--primary)");

    await page.goto("/app/configuracoes");
    await page.getByRole("radio", { name: /Fundo claro/i }).check({ force: true });
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();
    await page.goto("/");
    // LIGHT não usa cor inline — fundo vem de uma classe Tailwind estática.
    expect(await estiloFundoFooter()).toBe("");
    await expect(page.locator("footer")).toHaveClass(/bg-slate-50/);

    // Devolve ao padrão (AUTO): outros testes deste arquivo (luminosidade
    // do footer, acima) dependem do fundo escuro padrão da organização.
    await page.goto("/app/configuracoes");
    await page.getByRole("radio", { name: /Automático pelo tema/i }).check({ force: true });
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();
  });
});

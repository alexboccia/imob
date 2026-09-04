import { test, expect } from "@playwright/test";
import { IDS_E2E, ORG_A, login } from "./helpers";

// Redesign do site público (Proposta 2) — roda no host padrão (sem
// prefixo de slug: PUBLIC_ORG_SLUG=e2e-org-a em .env.test), já seedado
// com 2 imóveis AVAILABLE: "Apartamento com 2 quartos à venda, 58m² –
// Santo Amaro" (isLaunch/isFeatured/isOpportunity = true, aparece nas 3
// seções da Home) e "Apartamento E2E para edição" (sem badges, só
// aparece na listagem geral/busca). Ver prisma/seed-e2e.ts.
const IMOVEL_COM_BADGES = "Apartamento com 2 quartos à venda, 58m² – Santo Amaro";

// Nome público da organização A no seed (prisma/seed-e2e.ts) — o bloco
// institucional monta o título a partir dele, então o teste confere que o
// texto vem do TENANT e não de uma string fixa no componente.
const NOME_ORG_A = process.env.ORG_NAME ?? "Organização E2E A";

// OrganizationSettings é estado GLOBAL do tenant: o seed não o cria e
// também não o apaga entre rodadas, então um teste que salva contato
// contamina os seguintes se depender da ordem de execução. Todo teste que
// se importa com esses campos define explicitamente o estado que espera,
// pelo painel (que é o caminho real: salvar → invalidar cache → site
// público), em vez de assumir o que ficou da rodada anterior.
async function definirContato(
  page: import("@playwright/test").Page,
  valores: { whatsapp?: string; telefone?: string; email?: string }
) {
  await page.goto("/app/configuracoes");
  await page.locator("#whatsapp").fill(valores.whatsapp ?? "");
  await page.locator("#telefone").fill(valores.telefone ?? "");
  await page.locator("#email").fill(valores.email ?? "");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  // O formulário de Configurações só mostra feedback visível em caso de
  // ERRO (comportamento pré-existente, ver configuracoes.spec.ts) — o
  // sinal de conclusão é o botão sair do estado "Salvando...".
  await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();
}

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

  // Estado ativo do menu (SiteHeader): o contorno do item selecionado sai
  // de `aria-current="page"`, derivado da URL real (pathname + query), não
  // de estado de React — por isso os casos abaixo entram por deep link
  // direto, sem clicar, que é o cenário que quebraria se alguém trocasse
  // por estado local. Asserção pelo atributo/semântica, não por cor.
  for (const { rota, ativo } of [
    { rota: "/imoveis?finalidade=SALE", ativo: "Comprar" },
    { rota: "/imoveis?finalidade=RENT", ativo: "Alugar" },
    { rota: "/imoveis?lancamento=1", ativo: "Lançamentos" },
  ]) {
    test(`menu marca só "${ativo}" como ativo em ${rota} (deep link, sobrevive a refresh)`, async ({
      page,
    }) => {
      await page.goto(rota);
      const nav = page.locator("header nav");
      await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
      await expect(nav.locator('a[aria-current="page"]')).toHaveText(ativo);
    });
  }

  test("menu: clicar em Comprar/Alugar/Lançamentos leva à URL certa e move o estado ativo, sem deslocar o layout", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.locator("header nav");
    // Nenhum dos três é destino da Home, então nada fica ativo aqui.
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(0);

    // Geometria dos itens antes de qualquer seleção — o item ativo ganha
    // borda colorida, mas a borda já existe (transparente) no estado
    // inativo, então nada pode mudar de tamanho/posição ao alternar.
    const caixas = async () =>
      nav.locator("a").evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { x: Math.round(r.x), largura: Math.round(r.width), altura: Math.round(r.height) };
        })
      );
    const geometriaInicial = await caixas();
    // Os três têm a mesma altura (padding uniforme).
    expect(new Set(geometriaInicial.map((c) => c.altura)).size).toBe(1);

    for (const { rotulo, paramEsperado } of [
      { rotulo: "Comprar", paramEsperado: /finalidade=SALE/ },
      { rotulo: "Alugar", paramEsperado: /finalidade=RENT/ },
      { rotulo: "Lançamentos", paramEsperado: /lancamento=1/ },
    ]) {
      await nav.getByRole("link", { name: rotulo }).click();
      await page.waitForURL(paramEsperado);
      await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
      await expect(nav.locator('a[aria-current="page"]')).toHaveText(rotulo);
      expect(await caixas()).toEqual(geometriaInicial);
    }
  });

  test("menu: contorno do item ativo usa a cor do tenant, e os inativos não têm borda visível", async ({
    page,
  }) => {
    await page.goto("/imoveis?finalidade=SALE");
    const nav = page.locator("header nav");
    const bordas = await nav.locator("a").evaluateAll((els) =>
      els.map((e) => ({
        rotulo: e.textContent?.trim(),
        ativo: e.getAttribute("aria-current") === "page",
        cor: getComputedStyle(e).borderTopColor,
        // A --primary é injetada por organização em [orgSlug]/layout.tsx;
        // comparar contra ela (em vez de uma cor literal) é o que prova
        // que o contorno acompanha a paleta de qualquer tenant.
        primariaDoTenant: getComputedStyle(e).getPropertyValue("--primary").trim(),
      }))
    );
    const ativo = bordas.find((b) => b.ativo)!;
    const inativos = bordas.filter((b) => !b.ativo);

    expect(ativo.rotulo).toBe("Comprar");
    expect(ativo.cor).toBe(ativo.primariaDoTenant);
    // Inativos mantêm a borda (sem layout shift), mas transparente.
    for (const inativo of inativos) {
      expect(inativo.cor).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    }
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
    // O CTA de WhatsApp deixou de ser incondicional: sem número
    // configurado no tenant ele não existe (antes renderizava um link
    // "wa.me/" vazio). O formulário é o canal que existe sempre — os
    // dois modos têm testes próprios em "Detalhe do imóvel — WhatsApp".
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
    // Aba "Alugar" é o primeiro elemento visível dentro do card — seu
    // topo É o topo visual do painel (mais confiável que "Bairro", que
    // fica bem mais abaixo dentro de um card alto e não prova nada sobre
    // alinhamento).
    const abaAlugar = page.getByRole("button", { name: "Alugar", exact: true });
    const [boxHeadline, boxAbaAlugar] = await Promise.all([headline.boundingBox(), abaAlugar.boundingBox()]);

    expect(boxHeadline).not.toBeNull();
    expect(boxAbaAlugar).not.toBeNull();
    // Lado a lado: o painel fica à direita de onde a headline termina.
    expect(boxAbaAlugar!.x).toBeGreaterThan(boxHeadline!.x + boxHeadline!.width);
    // Alinhamento óptico (ver HeroHome.tsx: lg:items-start): o topo da
    // headline fica próximo do topo do painel, não "afundado" no meio de
    // um card bem mais alto — tolerância generosa (não pixel-perfeito),
    // só o suficiente pra pegar uma regressão real de alinhamento.
    expect(Math.abs(boxHeadline!.y - boxAbaAlugar!.y)).toBeLessThan(60);
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

// Altura do logotipo do rodapé (OrganizationSettings.footerLogoHeight) —
// campo novo, independente da altura do cabeçalho. Cobre o caminho real
// inteiro: formulário -> action (zod + clamp) -> banco -> releitura. Não
// depende de haver logo enviado, porque o que está sob teste é a
// persistência/saneamento do valor, não o desenho do rodapé.
test.describe("Configurações — altura do logotipo do rodapé", () => {
  test("salva a altura, sobrevive a recarregar, e não mexe na altura do cabeçalho", async ({
    page,
  }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");

    const alturaRodape = page.locator("#logoRodapeAltura");
    const alturaCabecalho = page.locator("#logoAltura");
    // Não afirma o valor inicial de propósito: o padrão de quem nunca
    // configurou já é coberto em
    // tests/integration/configuracoes-logo-rodape-altura.test.ts, e
    // prender este teste ao estado deixado por outra rodada o tornaria
    // frágil. Aqui o que importa é o round-trip pela UI real.
    const cabecalhoAntes = await alturaCabecalho.inputValue();

    await alturaRodape.fill("72");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();

    await page.goto("/app/configuracoes");
    await expect(alturaRodape).toHaveValue("72");
    // Os dois campos são independentes: mexer no rodapé não pode arrastar
    // a altura do cabeçalho junto.
    await expect(alturaCabecalho).toHaveValue(cabecalhoAntes);

    // O clamp de valores fora da faixa é coberto em
    // tests/integration/configuracoes-logo-rodape-altura.test.ts: pela UI
    // o próprio <input type="number" min/max> barra o submit antes de a
    // action ser chamada, então não dá pra exercitá-lo por aqui.

    // Devolve ao padrão pra não vazar estado pros outros testes do arquivo.
    await alturaRodape.fill("44");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();
  });
});

// ---------------------------------------------------------------------
// Camada comercial da Home (Fase 1): faixa de confiança, captação de
// proprietário e bloco institucional. O que estes testes protegem, além
// de "renderizou": que NADA aqui inventa dado. O seed não cria
// OrganizationSettings, então o estado padrão do site de teste é
// justamente o pior caso — tenant sem telefone, sem WhatsApp, sem rede
// social — e é nele que a degradação precisa ser elegante.
// ---------------------------------------------------------------------

test.describe("Site público — Home comercial (Fase 1)", () => {
  test("menu principal ganha 'Anuncie seu imóvel' apontando pra rota real, sem perder os três de sempre", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.locator("header nav");
    await expect(nav.getByRole("link", { name: "Comprar" })).toHaveAttribute("href", /finalidade=SALE/);
    await expect(nav.getByRole("link", { name: "Alugar" })).toHaveAttribute("href", /finalidade=RENT/);
    await expect(nav.getByRole("link", { name: "Lançamentos" })).toHaveAttribute("href", /lancamento=1/);
    await expect(nav.getByRole("link", { name: "Anuncie seu imóvel" })).toHaveAttribute(
      "href",
      /\/anuncie$/
    );
  });

  test("'Anuncie seu imóvel' recebe o mesmo estado ativo dos outros itens", async ({ page }) => {
    await page.goto("/anuncie");
    const nav = page.locator("header nav");
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('a[aria-current="page"]')).toHaveText("Anuncie seu imóvel");
  });

  test("faixa de confiança aparece abaixo do hero e não afirma número nenhum", async ({ page }) => {
    await page.goto("/");
    const faixa = page.getByRole("region", { name: "Como trabalhamos" });
    await expect(faixa).toBeVisible();
    await expect(faixa.locator("li")).toHaveCount(3);

    // Nenhuma estatística inventada: o produto não tem dado agregado real
    // de imóveis vendidos/clientes/anos de mercado, então a faixa não pode
    // conter dígito nenhum.
    const texto = (await faixa.innerText()).trim();
    expect(texto).not.toMatch(/\d/);
  });

  test("seção de captação leva ao formulário real de /anuncie", async ({ page }) => {
    await page.goto("/");
    const captacao = page.locator("section").filter({ hasText: "Vai vender ou alugar?" }).last();
    await expect(captacao.getByRole("heading", { name: "Vai vender ou alugar?" })).toBeVisible();

    const cta = captacao.getByRole("link", { name: "Anuncie seu imóvel" });
    await expect(cta).toHaveAttribute("href", /\/anuncie$/);
    await cta.click();
    await page.waitForURL("**/anuncie");
    await expect(page.getByRole("heading", { name: "Anuncie seu imóvel", level: 1 })).toBeVisible();
    await expect(page.locator("form")).toBeVisible();
  });

  test("bloco institucional usa o nome real do tenant e linka pro /contato real", async ({ page }) => {
    await page.goto("/");
    const bloco = page.locator("section").filter({ hasText: "Atendimento" }).last();
    await expect(
      bloco.getByRole("heading", { name: `Atendimento ${NOME_ORG_A}` })
    ).toBeVisible();

    const contato = bloco.getByRole("link", { name: "Entrar em contato" });
    await expect(contato).toHaveAttribute("href", /\/contato$/);
    await contato.click();
    await page.waitForURL("**/contato");
  });

  test("CTAs comerciais são links de verdade, não elementos com role=button", async ({ page }) => {
    await page.goto("/");
    for (const nome of ["Anuncie seu imóvel", "Entrar em contato"]) {
      const link = page.locator("main").getByRole("link", { name: nome });
      await expect(link.first()).toBeVisible();
      await expect(link.first()).toHaveAttribute("href", /.+/);
    }
  });

  test("sem WhatsApp configurado, a Home não mostra CTA de WhatsApp nem link wa.me quebrado", async ({
    page,
  }) => {
    await login(page, ORG_A);
    await definirContato(page, {});

    await page.goto("/");
    await expect(page.locator('main a[href*="wa.me"]')).toHaveCount(0);
    await expect(page.locator("main").getByText("Falar no WhatsApp")).toHaveCount(0);
  });
});

test.describe("Site público — Home comercial: dados reais do tenant", () => {
  // Configura contato pelo painel (não por escrita direta no banco) para
  // exercitar o caminho real: salvar → invalidar cache → site público.
  test("com WhatsApp/telefone/e-mail salvos, a Home mostra os canais do PRÓPRIO tenant", async ({
    page,
  }) => {
    const whatsapp = "+55 (11) 98888-7777";
    const telefone = "+55 (11) 3333-4444";
    const email = "atendimento@e2e.test";

    await login(page, ORG_A);
    try {
      await definirContato(page, { whatsapp, telefone, email });

      await page.goto("/");
      const bloco = page.locator("section").filter({ hasText: "Atendimento" }).last();
      await expect(bloco.getByText(whatsapp)).toBeVisible();
      await expect(bloco.getByText(telefone)).toBeVisible();
      await expect(bloco.getByText(email)).toBeVisible();

      // Link montado com os dígitos do número do TENANT — nunca um número
      // fixo do produto.
      const wa = page.locator('main a[href*="wa.me"]').first();
      await expect(wa).toHaveAttribute("href", /wa\.me\/5511988887777/);
      await expect(page.locator("main").getByText("Falar no WhatsApp").first()).toBeVisible();
    } finally {
      // Restaura mesmo se alguma asserção acima falhar: sem isto, uma
      // falha aqui derruba por tabela os testes de degradação.
      await definirContato(page, {});
    }
  });
});

test.describe("Site público — Home comercial: responsividade", () => {
  for (const largura of [375, 768, 1024, 1280, 1440]) {
    test(`${largura}px: seções comerciais sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/");
      await expect(page.locator("section").filter({ hasText: "Vai vender ou alugar?" }).last()).toBeVisible();
      expect(await semOverflow(page)).toBe(true);
    });
  }

  // O quarto item do menu não cabe ao lado do logo entre 640 e 767px — é
  // por isso que o menu horizontal passou a começar em md (768) e não em
  // sm (640). Este teste existe pra que voltar o breakpoint pra sm
  // reapareça como falha, não como header de duas linhas em produção.
  test("entre 640 e 767px o menu fica no hamburguer, sem quebrar o header em duas linhas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto("/");
    await expect(page.locator("header nav")).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();

    const linhas = await page.evaluate(() => {
      const links = [...document.querySelectorAll("header nav a")];
      return new Set(links.map((l) => Math.round(l.getBoundingClientRect().top))).size;
    });
    expect(linhas).toBeLessThanOrEqual(1);
  });

  test("768px: menu horizontal volta, com os quatro itens em uma linha só", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await page.goto("/");
    const nav = page.locator("header nav");
    await expect(nav).toBeVisible();
    await expect(nav.locator("a")).toHaveCount(4);
    const linhas = await page.evaluate(() => {
      const links = [...document.querySelectorAll("header nav a")];
      return new Set(links.map((l) => Math.round(l.getBoundingClientRect().top))).size;
    });
    expect(linhas).toBe(1);
  });
});

// ---------------------------------------------------------------------
// Detalhe do imóvel (Fase 2) — camada comercial. O seed não cria
// OrganizationSettings, então o estado padrão é o tenant SEM WhatsApp, e
// é nele que os CTAs precisam sumir sem deixar link quebrado. O modo com
// WhatsApp é configurado pelo painel dentro do próprio teste, com
// restauração garantida.
//
// O imóvel usado (imovelComBadgesOrgA) é o único do seed com ficha
// completa: descrição em dois parágrafos, áreas, contadores (incluindo
// suites: 0 de propósito), características de imóvel e de condomínio,
// condomínio/IPTU e obra em andamento.
// ---------------------------------------------------------------------

const URL_IMOVEL = `/imoveis/${IDS_E2E.imovelComBadgesOrgA}`;

test.describe("Detalhe do imóvel — conteúdo real", () => {
  test("hierarquia do topo: tipo/finalidade, rótulos, título, endereço e código", async ({
    page,
  }) => {
    await page.goto(URL_IMOVEL);
    await expect(page.getByRole("heading", { level: 1, name: IMOVEL_COM_BADGES })).toBeVisible();
    // Escopado ao cabeçalho: os cards de "imóveis próximos" repetem o
    // mesmo par tipo/finalidade mais abaixo na página.
    const cabecalho = page.locator("h1").locator("xpath=ancestor::div[2]");
    await expect(cabecalho.getByText("Apartamento · Comprar")).toBeVisible();
    for (const rotulo of ["Lançamento", "Destaque", "Oportunidade"]) {
      await expect(page.getByText(rotulo, { exact: true }).first()).toBeVisible();
    }
    // O código pode ou não ter prefixo — configuracoes.spec.ts grava um
    // propertyCodePrefix no MESMO tenant, e o prefixo é um recurso real
    // do produto. O teste prova que o código está na página, sem acoplar
    // ao formato que outro spec pode ter deixado configurado.
    await expect(cabecalho.getByText(/Cód\.\s*\S+/)).toBeVisible();
    await expect(page.getByText("Centro, São Paulo - SP").first()).toBeVisible();
  });

  test("descrição preserva a quebra de parágrafo do texto original", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    const descricao = page.getByRole("heading", { name: "Descrição" }).locator("xpath=../p");
    await expect(descricao).toContainText("Apartamento em construção com dois dormitórios.");
    await expect(descricao).toContainText("Segundo parágrafo da descrição");
    await expect(descricao).toHaveCSS("white-space", "pre-line");
  });

  test("características reais aparecem; contador em zero NÃO vira item", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    const bloco = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Características do imóvel" }) });
    await expect(bloco.getByText("Área total: 58 m²")).toBeVisible();
    await expect(bloco.getByText("Quartos: 2")).toBeVisible();
    await expect(bloco.getByText("Banheiros: 2")).toBeVisible();
    await expect(bloco.getByText("Vagas de garagem: 1")).toBeVisible();
    await expect(bloco.getByText("Aceita pet")).toBeVisible();

    // suites = 0 no seed: zero não é característica, e numa lista com
    // ícone de confirmação verde lido rápido vira o oposto do dado.
    await expect(page.getByText(/Suítes:\s*0/)).toHaveCount(0);
  });

  test("características do condomínio aparecem quando existem", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    const bloco = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Características do condomínio" }) });
    await expect(bloco.getByText("Portaria 24 horas")).toBeVisible();
    await expect(bloco.getByText("Salão de festas")).toBeVisible();
  });

  test("imóvel sem condomínio não renderiza o título do bloco", async ({ page }) => {
    await page.goto(`/imoveis/${IDS_E2E.imovelAluguelOrgA}`);
    await expect(
      page.getByRole("heading", { name: "Características do condomínio" })
    ).toHaveCount(0);
  });

  test("preço, condomínio e IPTU reais; aluguel mostra /mês", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    await expect(page.getByText("R$ 500.000", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Condomínio:")).toBeVisible();
    await expect(page.getByText("IPTU:")).toBeVisible();

    await page.goto(`/imoveis/${IDS_E2E.imovelAluguelOrgA}`);
    await expect(page.getByText("R$ 2.500").first()).toBeVisible();
    await expect(page.getByText("/mês").first()).toBeVisible();
    // Sem condomínio/IPTU cadastrados, as linhas não existem.
    await expect(page.getByText("Condomínio:")).toHaveCount(0);
    await expect(page.getByText("IPTU:")).toHaveCount(0);
  });

  test("localização e link do Google Maps continuam funcionando", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    await expect(page.getByRole("heading", { name: "Localização" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver no Google Maps" })).toHaveAttribute(
      "href",
      /google\.com\/maps/
    );
  });

  test("imóveis próximos aparecem e nunca incluem o próprio imóvel", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    const secao = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /Imóveis próximos/ }) });
    await expect(secao).toBeVisible();
    await expect(secao.getByText(IMOVEL_COM_BADGES, { exact: true })).toHaveCount(0);
    await expect(secao.locator(`a[href*="${IDS_E2E.imovelComBadgesOrgA}"]`)).toHaveCount(0);
  });

  test("compartilhar copia a URL do imóvel, sem o fragmento da âncora", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(URL_IMOVEL);
    // Sem Web Share API o componente cai no clipboard, que é o caminho
    // testável — a folha nativa do navegador não é automatizável.
    await page.evaluate(() => {
      delete (window.navigator as unknown as { share?: unknown }).share;
    });
    await page.locator('button[aria-label="Compartilhar"]').first().click();
    await expect(page.getByText("Link copiado!")).toBeVisible();
    const copiado = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiado).toContain(`/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    expect(copiado).not.toContain("#");
  });

  test("compartilhar existe mesmo em imóvel sem foto (fora da galeria)", async ({ page }) => {
    await page.goto(`/imoveis/${IDS_E2E.imovelAluguelOrgA}`);
    await expect(page.locator('button[aria-label="Compartilhar"]').first()).toBeVisible();
  });
});

test.describe("Detalhe do imóvel — lançamento / em construção", () => {
  test("evolução da obra e previsão de entrega continuam renderizando", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    await expect(page.getByRole("heading", { name: /Evolução da obra/ })).toBeVisible();
    // Escopado ao bloco da obra: "em construção" também aparece no texto
    // da descrição deste imóvel.
    const obra = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: /Evolução da obra/ }) })
      .last();
    await expect(obra.getByText("Em construção", { exact: true })).toBeVisible();
    await expect(obra.getByText("Na planta", { exact: true })).toBeVisible();
    await expect(obra.getByText("Pronto para morar", { exact: true })).toBeVisible();
    // deliveryForecast fixo no seed (2027-06), formatado como mês/ano.
    await expect(obra.getByText(/jun\/27/i)).toBeVisible();
  });

  test("imóvel sem obra cadastrada não mostra o bloco", async ({ page }) => {
    await page.goto(`/imoveis/${IDS_E2E.imovelAluguelOrgA}`);
    await expect(page.getByRole("heading", { name: /Evolução da obra/ })).toHaveCount(0);
  });

  test("375px: a linha do tempo da obra rola dentro do bloco, sem estourar a página", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(URL_IMOVEL);
    await expect(page.getByRole("heading", { name: /Evolução da obra/ })).toBeVisible();
    expect(await semOverflow(page)).toBe(true);
  });
});

test.describe("Detalhe do imóvel — WhatsApp", () => {
  test("sem WhatsApp configurado: nenhum CTA e nenhum link wa.me vazio; formulário continua", async ({
    page,
  }) => {
    await login(page, ORG_A);
    await definirContato(page, {});

    await page.goto(URL_IMOVEL);
    await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
    await expect(page.getByText("Falar no WhatsApp")).toHaveCount(0);

    // Nunca um href tipo "https://wa.me/?text=..." — link que abre erro.
    const hrefsQuebrados = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")].filter((a) =>
        /wa\.me\/(\?|$)/.test(a.getAttribute("href") ?? "")
      ).length
    );
    expect(hrefsQuebrados).toBe(0);

    // O canal que existe sempre.
    await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeVisible();
  });

  test("com WhatsApp configurado: CTA usa o número do tenant e mensagem com o imóvel", async ({
    page,
  }) => {
    const whatsapp = "+55 (11) 98888-7777";
    await login(page, ORG_A);
    try {
      await definirContato(page, { whatsapp });

      await page.goto(URL_IMOVEL);
      const cta = page.locator('a[href*="wa.me"]').first();
      await expect(cta).toBeVisible();

      const href = await cta.getAttribute("href");
      expect(href).toContain("wa.me/5511988887777");

      // Mensagem contextual: identifica o imóvel por título e código.
      const texto = decodeURIComponent(new URL(href!).searchParams.get("text") ?? "");
      expect(texto).toContain(IMOVEL_COM_BADGES);
      // Mesma razão do teste de hierarquia: aceita código com ou sem
      // prefixo do tenant, desde que o número do imóvel esteja lá.
      expect(texto).toMatch(/cód\.\s*\S*100\d+/i);
      expect(texto).toContain("São Paulo");
    } finally {
      await definirContato(page, {});
    }
  });
});

test.describe("Detalhe do imóvel — conversão no mobile", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("barra fixa mostra o preço e leva ao formulário sem rolar a página inteira", async ({
    page,
  }) => {
    await page.goto(URL_IMOVEL);
    const barra = page.locator("[data-cta-imovel]");
    await expect(barra).toBeVisible();
    await expect(barra.getByText("R$ 500.000")).toBeVisible();

    await barra.getByRole("link", { name: "Contato" }).click();
    await expect(page.locator("#contato-imovel")).toBeInViewport();
  });

  test("a barra não cobre o rodapé nem o fim do conteúdo", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    const colide = await page.evaluate(() => {
      const barra = document.querySelector("[data-cta-imovel]")!.getBoundingClientRect();
      const footer = document.querySelector("footer")!.getBoundingClientRect();
      return footer.bottom > barra.top && footer.top < barra.bottom;
    });
    expect(colide).toBe(false);
  });

  test("o botão flutuante de contato não cobre os botões da barra", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    const colide = await page.evaluate(() => {
      const fl = document.querySelector("[data-contato-flutuante]")!.getBoundingClientRect();
      const barra = document.querySelector("[data-cta-imovel]")!;
      return [...barra.querySelectorAll("a")].some((a) => {
        const r = a.getBoundingClientRect();
        return !(fl.bottom <= r.top || fl.top >= r.bottom || fl.right <= r.left || fl.left >= r.right);
      });
    });
    expect(colide).toBe(false);
  });

  test("a barra é exclusiva do detalhe — a Home não a renderiza", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-cta-imovel]")).toHaveCount(0);
  });
});

test.describe("Detalhe do imóvel — responsividade e isolamento", () => {
  for (const largura of [375, 768, 1024, 1280, 1440]) {
    test(`${largura}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(URL_IMOVEL);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await semOverflow(page)).toBe(true);
    });
  }

  test("acima de lg a barra fixa não existe (o card lateral fica visível)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(URL_IMOVEL);
    await expect(page.locator("[data-cta-imovel]")).toBeHidden();
  });

  test("imóvel de outro tenant não é servido por esta organização", async ({ page }) => {
    const resposta = await page.goto(`/imoveis/${IDS_E2E.imovelOrgB}`);
    expect(resposta?.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------
// Perfil público do corretor (Fase 2.1) — regra de PRIVACIDADE.
//
// O seed deixa o imóvel com badges sob responsabilidade do OWNER da
// organização, sem perfil público: é o pior caso de propósito. Antes
// desta fase esse membro era publicado automaticamente no site (o nome do
// usuário administrativo aparecia como "Corretor(a) responsável") só por
// ser o responsável pelo imóvel.
//
// Os testes que publicam alguém fazem isso pelo painel e restauram em
// finally — publicar é estado global do tenant.
// ---------------------------------------------------------------------

// A URL de edição do owner é estável dentro de uma rodada (o id do
// membro vem do seed). Descobrir uma vez e reusar evita passar pela
// listagem a cada chamada — com ~17 chamadas por rodada, essa navegação
// extra sozinha custava minutos no CI.
let urlEdicaoOwner: string | null = null;

async function abrirEdicaoDoOwner(page: import("@playwright/test").Page) {
  if (urlEdicaoOwner) {
    await page.goto(urlEdicaoOwner);
  } else {
    await page.goto("/app/usuarios");
    await page.getByRole("link", { name: new RegExp(ORG_A.email) }).first().click();
    await page.waitForURL(/\/app\/usuarios\/.+/);
    urlEdicaoOwner = new URL(page.url()).pathname;
  }
  await expect(page.getByText("Perfil público", { exact: true })).toBeVisible();
}

async function definirPerfilPublico(
  page: import("@playwright/test").Page,
  valores: { publicar: boolean; creci?: string; bio?: string; whatsapp?: string }
) {
  await abrirEdicaoDoOwner(page);
  await page.locator("#perfilPublicoCreci").fill(valores.creci ?? "");
  await page.locator("#perfilPublicoBio").fill(valores.bio ?? "");
  await page.locator("#perfilPublicoWhatsapp").fill(valores.whatsapp ?? "");

  const marcado =
    (await page
      .getByTestId("perfil-publico-ativo")
      .locator('[role="checkbox"]')
      .getAttribute("aria-checked")) === "true";
  if (marcado !== valores.publicar) {
    await page.getByTestId("perfil-publico-ativo").click();
  }
  // Nome EXATO: o botão vira "Salvando..." enquanto a action roda, e um
  // /^Salvar/ casa os dois estados — durante a transição isso resolve
  // pra dois elementos (strict mode) ou pro botão já desabilitado, o que
  // no CI aparece como timeout de 30s em vez de erro claro.
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.waitForURL(/\/app\/usuarios$/);
}

test.describe("Perfil público do corretor — privacidade", () => {
  test("membro existente nasce NÃO publicado, mesmo sendo OWNER e responsável pelo imóvel", async ({
    page,
  }) => {
    await login(page, ORG_A);
    await abrirEdicaoDoOwner(page);
    await expect(
      page.getByTestId("perfil-publico-ativo").locator('[role="checkbox"]')
    ).toHaveAttribute("aria-checked", "false");
  });

  test("responsável sem opt-in: nenhuma identidade pessoal no detalhe do imóvel", async ({
    page,
  }) => {
    await page.goto(URL_IMOVEL);
    // O rótulo que antes acompanhava o nome do usuário administrativo.
    await expect(page.getByText("Corretor(a) responsável")).toHaveCount(0);

    // E-mail de login jamais chega ao HTML público por causa desta feature.
    const html = await page.content();
    expect(html).not.toContain(ORG_A.email);
  });

  test("papel OWNER/ADMIN não publica ninguém automaticamente", async ({ page }) => {
    // O responsável do imóvel É o OWNER da organização (ver seed-e2e.ts).
    // Se papel implicasse publicação, o bloco apareceria aqui.
    await page.goto(URL_IMOVEL);
    await expect(page.getByText("Corretor(a) responsável")).toHaveCount(0);
  });

  test("dados preenchidos SEM publicar não aparecem no site", async ({ page }) => {
    const creci = "CRECI 11.111-J";
    const bio = "Apresentacao que nao deve ser publicada.";
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, { publicar: false, creci, bio, whatsapp: "11955554444" });

      await page.goto(URL_IMOVEL);
      const html = await page.content();
      expect(html).not.toContain(creci);
      expect(html).not.toContain(bio);
      expect(html).not.toContain("11955554444");
      await expect(page.getByText("Corretor(a) responsável")).toHaveCount(0);
    } finally {
      await definirPerfilPublico(page, { publicar: false });
    }
  });

  test("com opt-in, a identidade comercial aparece; ao despublicar, some sem perder os dados", async ({
    page,
  }) => {
    const creci = "CRECI 54.952-F";
    const bio = "Atuo com imoveis residenciais na zona sul.";
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, { publicar: true, creci, bio });

      await page.goto(URL_IMOVEL);
      await expect(page.getByText("Corretor(a) responsável")).toBeVisible();
      await expect(page.getByText(creci)).toBeVisible();
      await expect(page.getByText(bio)).toBeVisible();

      // Despublicar sem tocar nos campos: some do site...
      await definirPerfilPublico(page, { publicar: false, creci, bio });
      await page.goto(URL_IMOVEL);
      await expect(page.getByText("Corretor(a) responsável")).toHaveCount(0);
      expect(await page.content()).not.toContain(creci);

      // ...mas os dados continuam salvos no painel.
      await abrirEdicaoDoOwner(page);
      await expect(page.locator("#perfilPublicoCreci")).toHaveValue(creci);
      await expect(page.locator("#perfilPublicoBio")).toHaveValue(bio);
    } finally {
      await definirPerfilPublico(page, { publicar: false });
    }
  });

  test("perfil de outro tenant nunca aparece no site desta organização", async ({ page }) => {
    // O imóvel da organização B não é servido aqui em nenhuma hipótese,
    // então nem o membro dela pode alcançar esta página.
    const resposta = await page.goto(`/imoveis/${IDS_E2E.imovelOrgB}`);
    expect(resposta?.status()).toBe(404);
  });
});

test.describe("Perfil público do corretor — WhatsApp", () => {
  const WA_ORG = "+55 (11) 98888-7777";
  const WA_CORRETOR = "11977776666";

  // Publicar um perfil e salvar contato são round-trips completos pelo
  // painel. Este teste cobre as duas asserções que dependem do MESMO
  // setup — qual número o CTA usa e se a mensagem contextual da Fase 2
  // sobrevive à troca de destinatário — em vez de montar o cenário duas
  // vezes.
  test("corretor publicado COM WhatsApp público: CTA usa o número dele, sem perder a mensagem contextual", async ({
    page,
  }) => {
    await login(page, ORG_A);
    try {
      await definirContato(page, { whatsapp: WA_ORG });
      await definirPerfilPublico(page, { publicar: true, whatsapp: WA_CORRETOR });

      await page.goto(URL_IMOVEL);
      const href = await page.locator('a[href*="wa.me"]').first().getAttribute("href");
      expect(href).toContain(`wa.me/${WA_CORRETOR}`);

      const texto = decodeURIComponent(new URL(href!).searchParams.get("text") ?? "");
      expect(texto).toContain(IMOVEL_COM_BADGES);
      expect(texto).toMatch(/cód\.\s*\S*100\d+/i);
      expect(texto).toContain("São Paulo");
    } finally {
      await definirPerfilPublico(page, { publicar: false });
      await definirContato(page, {});
    }
  });

  test("corretor publicado SEM WhatsApp público: cai no número da imobiliária", async ({
    page,
  }) => {
    await login(page, ORG_A);
    try {
      await definirContato(page, { whatsapp: WA_ORG });
      await definirPerfilPublico(page, { publicar: true, whatsapp: "" });

      await page.goto(URL_IMOVEL);
      const href = await page.locator('a[href*="wa.me"]').first().getAttribute("href");
      expect(href).toContain("wa.me/5511988887777");
    } finally {
      await definirPerfilPublico(page, { publicar: false });
      await definirContato(page, {});
    }
  });

  test("corretor NÃO publicado: o WhatsApp dele nunca é usado, nem o público", async ({
    page,
  }) => {
    await login(page, ORG_A);
    try {
      await definirContato(page, { whatsapp: WA_ORG });
      await definirPerfilPublico(page, { publicar: false, whatsapp: WA_CORRETOR });

      await page.goto(URL_IMOVEL);
      const href = await page.locator('a[href*="wa.me"]').first().getAttribute("href");
      expect(href).toContain("wa.me/5511988887777");
      expect(href).not.toContain(WA_CORRETOR);
    } finally {
      await definirPerfilPublico(page, { publicar: false });
      await definirContato(page, {});
    }
  });

  test("sem WhatsApp em lugar nenhum: sem CTA, mas o formulário continua", async ({ page }) => {
    await login(page, ORG_A);
    try {
      await definirContato(page, {});
      await definirPerfilPublico(page, { publicar: true, whatsapp: "" });

      await page.goto(URL_IMOVEL);
      await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeVisible();
      // A identidade do profissional continua aparecendo — o que sumiu
      // foi só o canal que não existe.
      await expect(page.getByText("Corretor(a) responsável")).toBeVisible();
    } finally {
      await definirPerfilPublico(page, { publicar: false });
    }
  });

});

test.describe("Perfil público do corretor — responsividade do card", () => {
  // Um teste só, publicando UMA vez e variando a viewport: publicar é um
  // round-trip completo pelo painel (navegar, preencher, salvar,
  // redirecionar), e repetir isso por breakpoint custava dez saves pra
  // verificar o que só depende da largura da janela. A cobertura é a
  // mesma — cada largura continua sendo verificada.
  test("card com perfil publicado não quebra em nenhuma largura", async ({ page }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, {
        publicar: true,
        creci: "CRECI 54.952-F",
        bio: "Apresentacao profissional usada para checar o layout do card em varias larguras.",
      });

      for (const largura of [375, 768, 1024, 1280, 1440]) {
        await page.setViewportSize({ width: largura, height: 900 });
        await page.goto(URL_IMOVEL);
        await expect(
          page.getByText("Corretor(a) responsável"),
          `perfil deveria aparecer em ${largura}px`
        ).toBeVisible();
        expect(await semOverflow(page), `overflow em ${largura}px`).toBe(true);
      }
    } finally {
      await definirPerfilPublico(page, { publicar: false });
    }
  });
});

// ---------------------------------------------------------------------
// Lançamento / em construção (Fase 3). Mesma rota do detalhe: o que muda
// é a PRIORIDADE do que aparece primeiro, sempre condicionada a dado
// real.
//
// Três fixtures cobrem os três estados:
//   - imovelComBadgesOrgA .......... lançamento com ficha completa
//     (rótulo + obra em andamento + previsão + construtora + ficha)
//   - imovelLancamentoMinimoOrgA ... rótulo de lançamento e nada mais
//   - imovelParaEditarOrgA ......... imóvel comum, sem nada de obra
// ---------------------------------------------------------------------

const URL_LANCAMENTO_MINIMO = `/imoveis/${IDS_E2E.imovelLancamentoMinimoOrgA}`;
const URL_IMOVEL_PRONTO = `/imoveis/${IDS_E2E.imovelParaEditarOrgA}`;

test.describe("Detalhe — experiência de lançamento", () => {
  test("lançamento com obra: estágio, previsão e construtora ganham destaque no topo", async ({
    page,
  }) => {
    await page.goto(URL_IMOVEL);
    const cabecalho = page.locator("h1").locator("xpath=ancestor::div[2]");
    await expect(cabecalho.getByText("Obra:")).toBeVisible();
    await expect(cabecalho.getByText("Em construção")).toBeVisible();
    await expect(cabecalho.getByText("Previsão de entrega:")).toBeVisible();
    await expect(cabecalho.getByText("Construtora:")).toBeVisible();
  });

  test("previsão de entrega respeita a granularidade real do dado (mês/ano, nunca dia)", async ({
    page,
  }) => {
    await page.goto(URL_IMOVEL);
    // deliveryForecast do seed é 2027-06; o formulário admin é um
    // <input type="month">, então dia nunca é informação real.
    await expect(page.getByText("Junho de 2027")).toBeVisible();
    await expect(page.getByText(/\d{1,2} de junho/i)).toHaveCount(0);
  });

  test("estágio da obra usa os valores reais do enum — sem percentual inventado", async ({
    page,
  }) => {
    await page.goto(URL_IMOVEL);
    const texto = await page.locator("main").innerText();
    // O domínio só conhece Na planta / Em construção / Pronto para morar.
    expect(texto).not.toMatch(/\d+\s*%/);
    expect(texto).not.toMatch(/conclu[ií]d[oa]s?\s*:/i);
  });

  test("com obra em andamento, a evolução vem antes da descrição", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    const titulos = await page.locator("main h2").allInnerTexts();
    const iObra = titulos.findIndex((t) => /Evolução da obra/.test(t));
    const iDescricao = titulos.indexOf("Descrição");
    expect(iObra).toBeGreaterThanOrEqual(0);
    expect(iObra).toBeLessThan(iDescricao);
  });

  test("resumo comercial mostra atributos reais e nenhum contador em zero", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    const resumo = page.getByRole("region", { name: "Resumo do imóvel" });
    await expect(resumo).toBeVisible();
    await expect(resumo.getByText("52 m²")).toBeVisible();
    // suites = 0 no seed.
    await expect(resumo.getByText("Suítes")).toHaveCount(0);
    // Sem duplicar o que já está em destaque no cabeçalho.
    await expect(resumo.getByText("Entrega")).toHaveCount(0);
  });

  test("lançamento MÍNIMO: rótulo aparece, mas nenhum bloco vazio é criado", async ({ page }) => {
    await page.goto(URL_LANCAMENTO_MINIMO);
    await expect(page.getByText("Lançamento", { exact: true }).first()).toBeVisible();

    const cabecalho = page.locator("h1").locator("xpath=ancestor::div[2]");
    await expect(cabecalho.getByText("Obra:")).toHaveCount(0);
    await expect(cabecalho.getByText("Previsão de entrega:")).toHaveCount(0);
    await expect(cabecalho.getByText("Construtora:")).toHaveCount(0);

    await expect(page.getByRole("heading", { name: /Evolução da obra/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Plantas e imagens" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Resumo do imóvel" })).toHaveCount(0);
  });

  test("imóvel comum NÃO recebe a UI de lançamento", async ({ page }) => {
    await page.goto(URL_IMOVEL_PRONTO);
    const cabecalho = page.locator("h1").locator("xpath=ancestor::div[2]");
    await expect(cabecalho.getByText("Obra:")).toHaveCount(0);
    await expect(cabecalho.getByText("Previsão de entrega:")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Evolução da obra/ })).toHaveCount(0);
  });

  test("sem vídeo cadastrado, nenhum player ou botão de vídeo é renderizado", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    await expect(page.locator("#videos")).toHaveCount(0);
  });

  test("375px: o lançamento completo não estoura a viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(URL_IMOVEL);
    await expect(page.getByRole("heading", { name: /Evolução da obra/ })).toBeVisible();
    expect(await semOverflow(page)).toBe(true);
  });
});

// Trava semântica: o domínio NÃO tem empreendimento nem unidades — cada
// Property é um imóvel independente (auditado na Fase 3). A seção de
// relacionados é proximidade geográfica, e chamá-la de "outras unidades"
// afirmaria uma relação que não existe no banco. Este teste existe pra
// que essa regressão apareça como falha, e não como texto plausível.
test.describe("Detalhe — relacionados não são 'unidades'", () => {
  for (const [nome, url] of [
    ["lançamento", URL_IMOVEL],
    ["lançamento mínimo", URL_LANCAMENTO_MINIMO],
    ["imóvel comum", URL_IMOVEL_PRONTO],
  ] as const) {
    test(`${nome}: nada é rotulado como unidade de um empreendimento`, async ({ page }) => {
      await page.goto(url);
      const texto = await page.locator("main").innerText();
      expect(texto).not.toMatch(/outras unidades/i);
      expect(texto).not.toMatch(/unidades dispon/i);
      expect(texto).not.toMatch(/a partir de/i);
    });
  }

  test("a seção de relacionados mantém o rótulo semanticamente correto", async ({ page }) => {
    await page.goto(URL_IMOVEL);
    await expect(
      page.getByRole("heading", { name: "Imóveis próximos que você pode gostar" })
    ).toBeVisible();
  });
});

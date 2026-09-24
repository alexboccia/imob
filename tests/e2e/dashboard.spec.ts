import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// Redesenho do Dashboard — roda em ORG_A (CRM habilitado, já seedada com
// pelo menos 1 imóvel AVAILABLE). Números absolutos dependem de quantos
// leads/negócios outras specs já criaram nesta mesma organização
// compartilhada (o seed nunca limpa entre specs) — por isso os testes
// que provam "número coerente com fixture" comparam ANTES/DEPOIS de uma
// ação própria (delta), nunca um valor absoluto hardcoded.
test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
  });

  test("KPIs renderizam com números não-negativos", async ({ page }) => {
    await page.goto("/app");
    // Escopado a <p> (não <span>): "Negócios fechados" também aparece na
    // legenda do recharts (<span class="recharts-legend-item-text">) na
    // mesma página — sem isso, getByText bate nos dois e o teste falha
    // por ambiguidade, não por um problema real do produto.
    // Fase 65 — os KPIs passaram a usar o cartão compartilhado do
    // backoffice (CartaoEstatistica). As asserções deixaram de depender de
    // classes utilitárias (`p.text-2xl`, `p.text-sm.text-muted-foreground`),
    // que descreviam o CSS de uma versão e quebrariam a cada ajuste
    // visual, e passaram a usar as âncoras estruturais do componente. A
    // INTENÇÃO original — os quatro rótulos visíveis e quatro valores
    // numéricos não-negativos — é a mesma, agora presa à estrutura.
    for (const titulo of ["Imóveis disponíveis", "Novos leads", "Negócios fechados", "Imóveis parados"]) {
      await expect(page.locator("[data-kpi-rotulo]", { hasText: titulo }).first()).toBeVisible();
    }
    const valores = await page.locator("[data-grade-kpis] [data-kpi-valor]").allTextContents();
    expect(valores).toHaveLength(4);
    for (const v of valores) {
      expect(Number(v), `valor "${v}" deveria ser um número >= 0`).toBeGreaterThanOrEqual(0);
    }
  });

  test("criar um lead incrementa 'Novos leads' em exatamente 1 (número coerente com fixture)", async ({ page }) => {
    await page.goto("/app");
    const kpiNovosLeads = page
      .locator("[data-grade-kpis] [data-slot=card]")
      .filter({ has: page.locator("[data-kpi-rotulo]", { hasText: "Novos leads" }) })
      .locator("[data-kpi-valor]");
    const valorAntes = Number(await kpiNovosLeads.textContent());

    const nomeUnico = `Lead Dashboard E2E ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nomeUnico);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.goto("/app");
    const valorDepois = Number(
      await page
        .locator("[data-grade-kpis] [data-slot=card]")
        .filter({ has: page.locator("[data-kpi-rotulo]", { hasText: "Novos leads" }) })
        .locator("[data-kpi-valor]")
        .textContent()
    );
    expect(valorDepois).toBe(valorAntes + 1);
  });

  test("gráfico de desempenho comercial renderiza com totais do período", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByText("Desempenho comercial", { exact: true })).toBeVisible();
    await expect(page.getByText("Últimos 6 meses", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Leads:/)).toBeVisible();
    await expect(page.getByText(/^Negócios fechados:/)).toBeVisible();
    // recharts renderiza um <svg> com as linhas — confirma que o gráfico
    // montou de verdade, sem inspecionar a implementação interna da lib.
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
  });

  test("composição do portfólio: alterna Status/Tipo/Bairro, estado ativo correto", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByText("Composição do portfólio", { exact: true })).toBeVisible();

    const pillStatus = page.getByRole("button", { name: "Status", exact: true });
    const pillTipo = page.getByRole("button", { name: "Tipo", exact: true });
    const pillBairro = page.getByRole("button", { name: "Bairro", exact: true });

    // Status é o padrão inicial.
    await expect(pillStatus).toHaveAttribute("aria-pressed", "true");
    await expect(pillTipo).toHaveAttribute("aria-pressed", "false");

    await pillTipo.click();
    await expect(pillTipo).toHaveAttribute("aria-pressed", "true");
    await expect(pillStatus).toHaveAttribute("aria-pressed", "false");

    await pillBairro.click();
    await expect(pillBairro).toHaveAttribute("aria-pressed", "true");
    await expect(pillTipo).toHaveAttribute("aria-pressed", "false");
    // "Centro" é o bairro do imóvel seedado (e2e-imovel-editar-a) —
    // garantido presente independente de quantos outros imóveis outras
    // specs já criaram.
    await expect(page.getByText("Centro", { exact: true }).first()).toBeVisible();
  });

  test("375px: sem overflow horizontal do documento", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/app");
    const semOverflowHorizontal = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflowHorizontal).toBe(true);
  });

  // 360px separado de 375px: achado real durante o redesenho — a
  // palavra "Dashboard" sozinha (sem espaço pra quebrar) tem largura
  // natural maior que a coluna real disponível em 360px, e sem
  // break-words vazava do próprio h1 pro scrollWidth do documento
  // (373 vs 360 medido). 375px já tinha espaço suficiente e nunca
  // pegou esse bug sozinho — por isso os dois viewports ficam cobertos
  // separadamente.
  test("360px: sem overflow horizontal do documento", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app");
    const semOverflowHorizontal = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflowHorizontal).toBe(true);
  });

  // Correção do Finding MEDIUM (auditoria pré-commit) — ausência de
  // overflow de documento (teste acima) NÃO prova legibilidade: o bug
  // real (título do KPI quebrando caractere a caractere) nunca violava
  // scrollWidth, só a largura/altura do próprio <p>. Título mais longo
  // ("Imóveis disponíveis") escolhido de propósito — é o que mais sofria
  // (16px de largura real, texto virando 1-2 caracteres por linha, antes
  // da correção). Duas asserções estruturais, não pixel-perfect:
  // (1) largura mínima útil — o bug antigo media 16px a 360px; qualquer
  // regressão de volta a esse patamar (< 40px) falha aqui; (2) contagem
  // aproximada de linhas — quebra por palavra real produz no máximo 3
  // linhas pra esse título nesta largura; quebra caractere a caractere
  // produziria bem mais que isso (o texto tem 20 caracteres).
  test("360px: título do KPI mais longo é legível (quebra por palavra, não por caractere)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app");

    const titulo = page.locator("[data-grade-kpis] [data-kpi-rotulo]", {
      hasText: "Imóveis disponíveis",
    });
    await expect(titulo).toBeVisible();

    const medida = await titulo.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "20");
      return { width: r.width, height: r.height, linhasAprox: Math.round(r.height / lineHeight) };
    });

    expect(medida.width, `largura do título: ${medida.width}px`).toBeGreaterThanOrEqual(40);
    expect(medida.linhasAprox, `linhas aproximadas: ${medida.linhasAprox}`).toBeLessThanOrEqual(4);
  });
});

// =====================================================================
// Fase 65 — fundação visual do backoffice, Dashboard como piloto
// =====================================================================
// A cobertura abaixo é ESTRUTURAL e comportamental, não de pixel: o que
// precisa não regredir é a hierarquia da informação, a semântica dos
// controles e a ausência de overflow — não o valor de um padding.
test.describe("Dashboard — estrutura do novo backoffice", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");
  });

  test("a saudação continua dinâmica e é o único h1 da página", async ({ page }) => {
    const h1 = page.locator("main h1");
    await expect(h1).toHaveCount(1);
    // Nome vem da sessão — nunca "Administrador" escrito em código.
    await expect(h1).toHaveText(/^Olá, .+/);
    await expect(h1).not.toHaveText("Olá, Administrador");
    await expect(page.getByText("O que precisa da sua atenção agora.")).toBeVisible();
  });

  test("Meu trabalho/Equipe é navegação, não tablist", async ({ page }) => {
    const barra = page.locator("[data-visao-central]");
    // ORG_A loga como OWNER, então o alternador existe.
    await expect(barra).toBeVisible();

    // A semântica NÃO pode virar tablist: as visões são resolvidas no
    // servidor por `?visao=`, não por painéis alternados no cliente.
    await expect(barra).toHaveAttribute("role", "navigation");
    await expect(barra.getByRole("tab")).toHaveCount(0);

    const links = barra.getByRole("link");
    await expect(links).toHaveCount(2);
    await expect(barra.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(barra.locator('[aria-current="page"]')).toContainText("Meu trabalho");

    // Cada opção tem ícone de apoio, e o estado ativo também é dito em texto.
    await expect(barra.locator("svg")).toHaveCount(2);
    await expect(barra.locator('[aria-current="page"]')).toContainText("(visão atual)");
  });

  test("Equipe continua funcionando e move o estado ativo", async ({ page }) => {
    await page.locator("[data-visao-central]").getByRole("link", { name: /Equipe/ }).click();
    await expect(page).toHaveURL(/visao=equipe/);
    await expect(
      page.locator('[data-visao-central] [aria-current="page"]')
    ).toContainText("Equipe");
  });

  test("a hierarquia de cabeçalhos é consistente (h1 > h2 > h3)", async ({ page }) => {
    const niveis = await page
      .locator("main h1, main h2, main h3")
      .evaluateAll((els) => els.map((el) => Number(el.tagName[1])));

    expect(niveis[0], "a página abre com o h1").toBe(1);
    // Nenhum salto de nível — é o que mantém a navegação por cabeçalho
    // utilizável em leitor de tela.
    for (let i = 1; i < niveis.length; i += 1) {
      expect(
        niveis[i] - niveis[i - 1],
        `salto de h${niveis[i - 1]} para h${niveis[i]}`
      ).toBeLessThanOrEqual(1);
    }
  });

  test("a Visão geral é uma seção com KPIs e gráficos", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    await expect(page.getByText("Panorama da operação imobiliária.")).toBeVisible();
    await expect(page.locator("[data-grade-kpis]")).toBeVisible();
  });

  test("Status/Tipo/Bairro continuam botões de estado, na barra segmentada", async ({ page }) => {
    const grupo = page.getByRole("group", { name: "Dimensão da composição do portfólio" });
    // O próprio grupo É a moldura segmentada compartilhada do backoffice.
    await expect(
      page.locator('[data-barra-segmentada][aria-label="Dimensão da composição do portfólio"]')
    ).toHaveCount(1);
    // Estado local do gráfico — aria-pressed, nunca aria-selected de aba.
    await expect(grupo.getByRole("button")).toHaveCount(3);
    await expect(grupo.locator('[aria-pressed="true"]')).toHaveCount(1);
  });
});

test.describe("Dashboard — responsividade do novo layout", () => {
  for (const [largura, altura] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    test(`${largura}×${altura}: sem overflow e com as seções no lugar`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await login(page, ORG_A);
      await page.goto("/app");

      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("[data-grade-kpis]")).toBeVisible();

      const rolou = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolou, `rolou ${rolou}px em ${largura}px`).toBe(0);
    });
  }

  test("1440px: os quatro KPIs ficam numa linha só", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, ORG_A);
    await page.goto("/app");

    const topos = await page
      .locator("[data-grade-kpis] [data-slot=card]")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(topos).toHaveLength(4);
    expect(new Set(topos).size, `topos: ${topos.join(", ")}`).toBe(1);
  });

  test("390px: os KPIs empilham em uma coluna, com rótulo legível", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, ORG_A);
    await page.goto("/app");

    const topos = await page
      .locator("[data-grade-kpis] [data-slot=card]")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    // Uma coluna: quatro topos distintos. Duas colunas colapsariam o
    // rótulo a 0px nesta largura (bug medido em telas irmãs).
    expect(new Set(topos).size).toBe(4);

    const larguras = await page
      .locator("[data-grade-kpis] [data-kpi-rotulo]")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    for (const w of larguras) expect(w, `rótulo com ${w}px`).toBeGreaterThan(40);
  });
});

test.describe("Dashboard — sidebar preservada", () => {
  test("a sidebar não mudou: mesmos itens, ícones e item ativo", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    const nav = page.locator('aside nav[aria-label="Navegação principal"]');
    await expect(nav).toBeVisible();
    // O Dashboard integra-se à sidebar aprovada nas Fases 63/64 — não a
    // redesenha. O item ativo continua sendo o da rota atual.
    const atual = nav.locator('a[aria-current="page"]');
    await expect(atual).toHaveCount(1);
    await expect(atual).toHaveText("Dashboard");
    expect(await nav.locator("svg").count()).toBeGreaterThan(10);
  });
});

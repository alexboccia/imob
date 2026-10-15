import { test, expect } from "@playwright/test";
import { ORG_A, ORG_RESTRITA_ANA, login } from "./helpers";

// Fase 62 — a sidebar do painel ganhou ícones em todos os itens e passou a
// destacar a rota atual (o menu mobile já destacava desde a Fase 26; o
// desktop não, porque o layout é Server Component e não tem usePathname).
//
// Reorganização do menu lateral — os itens passaram a viver em 4 grupos
// nomeados e recolhíveis (Dashboard continua fixo, fora de grupo). Esta
// suíte foi reescrita para a nova ordem/estrutura aprovada; a cobertura
// de "o que NÃO podia mudar" (recorte por papel/módulo, rotas, ícones,
// item ativo) continua a mesma, só adaptada à nova organização visual.

const ITENS_ESPERADOS_OWNER = [
  "Dashboard",
  "Agenda",
  "Clientes",
  "Imóveis",
  "Minhas comissões",
  "Pipeline",
  "Características",
  "Contatos a identificar",
  "Empreendimentos",
  "Tipos de imóvel",
  "Analytics",
  "Auditoria",
  "Usuários",
  "Assinatura",
  "Configurações",
  "Manutenção",
  "Meu perfil público",
];

const GRUPOS_ESPERADOS: { titulo: string; itens: string[] }[] = [
  { titulo: "Gestão comercial", itens: ["Agenda", "Clientes", "Imóveis", "Minhas comissões", "Pipeline"] },
  {
    titulo: "Cadastros e organização",
    itens: ["Características", "Contatos a identificar", "Empreendimentos", "Tipos de imóvel"],
  },
  { titulo: "Gestão e controle", itens: ["Analytics", "Auditoria", "Usuários"] },
  { titulo: "Configurações", itens: ["Assinatura", "Configurações", "Manutenção", "Meu perfil público"] },
];

function sidebar(page: import("@playwright/test").Page) {
  return page.locator('aside nav[aria-label="Navegação principal"]');
}

test.describe("Sidebar do painel — itens e autorização", () => {
  test("o OWNER vê os mesmos itens de sempre, na nova ordem agrupada", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    const rotulos = await sidebar(page)
      .locator("a, span[title]")
      .evaluateAll((els) => els.map((el) => (el.textContent ?? "").replace(/\s*Pro\s*$/, "").trim()));

    expect(rotulos).toEqual(ITENS_ESPERADOS_OWNER);
  });

  test("cada item continua apontando para a própria rota", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    // href é contrato: um ícone novo não pode mexer no destino.
    const pares = await sidebar(page)
      .locator("a")
      .evaluateAll((els) =>
        els.map((el) => ({
          label: (el.textContent ?? "").trim(),
          href: el.getAttribute("href"),
        }))
      );

    const porLabel = new Map(pares.map((p) => [p.label, p.href]));
    expect(porLabel.get("Dashboard")).toBe("/app");
    expect(porLabel.get("Imóveis")).toBe("/app/imoveis");
    expect(porLabel.get("Configurações")).toBe("/app/configuracoes");
    expect(porLabel.get("Meu perfil público")).toBe("/app/meu-perfil");
    expect(porLabel.get("Manutenção")).toBe("/app/manutencao");
    expect(porLabel.get("Auditoria")).toBe("/app/auditoria");
  });

  test("o recorte por papel não mudou: o corretor não recebe Configurações", async ({ page }) => {
    await login(page, ORG_RESTRITA_ANA);
    await page.goto("/app");

    // Higiene de interface da Fase 25 — quem não pode entrar não vê a
    // porta. Quem controla o acesso continua sendo a página/action.
    await expect(sidebar(page).getByRole("link", { name: "Configurações" })).toHaveCount(0);
    // E continua vendo o que sempre viu.
    await expect(sidebar(page).getByRole("link", { name: "Imóveis" })).toBeVisible();
  });
});

test.describe("Sidebar do painel — ícones", () => {
  test("TODO item existente tem exatamente um ícone", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    const contagens = await sidebar(page)
      .locator("a, span[title]")
      .evaluateAll((els) =>
        els.map((el) => ({
          label: (el.textContent ?? "").trim(),
          svgs: el.querySelectorAll("svg").length,
        }))
      );

    expect(contagens.length).toBe(ITENS_ESPERADOS_OWNER.length);
    for (const item of contagens) {
      expect(item.svgs, `ícones em "${item.label}"`).toBe(1);
    }
  });

  test("os ícones dos itens têm o mesmo tamanho e são decorativos", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    // Escopado aos ITENS (não aos chevrons de cabeçalho de grupo, que são
    // menores de propósito — ver teste de cabeçalhos abaixo).
    const svgs = sidebar(page).locator("a svg, span[title] svg");
    const medidas = await svgs.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          largura: Math.round(r.width),
          altura: Math.round(r.height),
          escondido: el.getAttribute("aria-hidden"),
        };
      })
    );

    expect(medidas.length).toBe(ITENS_ESPERADOS_OWNER.length);
    for (const m of medidas) {
      // 18-20px, como pede o padrão visual — e quadrados.
      expect(m.largura, `largura ${m.largura}`).toBeGreaterThanOrEqual(18);
      expect(m.largura).toBeLessThanOrEqual(20);
      expect(m.altura).toBe(m.largura);
      // O rótulo já diz o que o item é: o ícone não deve ser anunciado.
      expect(m.escondido).toBe("true");
    }
    // Um tamanho só em toda a sidebar.
    expect(new Set(medidas.map((m) => m.largura)).size).toBe(1);
  });

  test("ícones diferentes para itens diferentes — nenhum item repete o vizinho", async ({
    page,
  }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    // Compara o desenho (o path do SVG): dois itens com o mesmo ícone
    // seriam indistinguíveis de relance, que é o problema que a Fase 58
    // já teve com as caixas Topo/Rodapé.
    const desenhos = await sidebar(page)
      .locator("a svg, span[title] svg")
      .evaluateAll((els) => els.map((el) => el.innerHTML));

    expect(new Set(desenhos).size).toBe(desenhos.length);
  });
});

test.describe("Sidebar do painel — item ativo", () => {
  test("a rota atual é marcada com aria-current, e só ela", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");

    const atuais = sidebar(page).locator('a[aria-current="page"]');
    await expect(atuais).toHaveCount(1);
    await expect(atuais).toHaveText("Configurações");
  });

  test("navegar move o destaque", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/imoveis");
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveText("Imóveis");

    await sidebar(page).getByRole("link", { name: "Agenda" }).click();
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveText("Agenda");
  });

  test("o Dashboard só acende em /app, não em toda rota do painel", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveText("Dashboard");

    // startsWith("/app") sem o casamento exato acenderia o Dashboard em
    // qualquer tela — é a regressão que este teste prende.
    await page.goto("/app/usuarios");
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveText("Usuários");
  });

  test("o item ativo não depende só de cor: o peso da fonte também muda", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");

    const pesos = await sidebar(page)
      .locator("a")
      .evaluateAll((els) =>
        els.map((el) => ({
          atual: el.getAttribute("aria-current") === "page",
          peso: Number(getComputedStyle(el).fontWeight),
        }))
      );

    const ativo = pesos.find((p) => p.atual);
    const inativo = pesos.find((p) => !p.atual);
    expect(ativo).toBeTruthy();
    expect(inativo).toBeTruthy();
    expect(ativo!.peso).toBeGreaterThan(inativo!.peso);
  });

  test("o foco por teclado continua visível nos links da sidebar", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    const link = sidebar(page).getByRole("link", { name: "Imóveis" });
    await link.focus();
    await expect(link).toBeFocused();
    // focus-visible tem de produzir um anel real, não só uma classe.
    const temAnel = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.boxShadow !== "none" || s.outlineStyle !== "none";
    });
    expect(temAnel).toBe(true);
  });
});

test.describe("Sidebar do painel — mobile preservado", () => {
  test("abaixo de md a sidebar sai e o menu mobile assume, com ícones", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await login(page, ORG_A);
    await page.goto("/app");

    await expect(page.locator("aside")).toBeHidden();

    await page.getByRole("button", { name: "Abrir menu" }).click();
    // O <nav> desktop continua no DOM (o <aside> é escondido por CSS), então
    // o menu mobile tem de ser buscado DENTRO do Sheet.
    const navMobile = page
      .locator('[data-slot="sheet-content"] nav[aria-label="Navegação principal"]')
      .or(page.getByRole("dialog").locator('nav[aria-label="Navegação principal"]'));
    await expect(navMobile).toBeVisible();

    // Os MESMOS itens do desktop, cada um com o seu ícone.
    const contagens = await navMobile
      .locator("a, span[title]")
      .evaluateAll((els) => els.map((el) => el.querySelectorAll("svg").length));
    expect(contagens.length).toBe(ITENS_ESPERADOS_OWNER.length);
    for (const svgs of contagens) expect(svgs).toBe(1);
  });
});

test.describe("Reorganização do menu lateral — grupos nomeados e recolhíveis", () => {
  test("os 4 grupos aparecem, na ordem aprovada, com o Dashboard fixo e fora de grupo", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    const titulosGrupo = await sidebar(page)
      .getByRole("button")
      .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
    expect(titulosGrupo).toEqual(GRUPOS_ESPERADOS.map((g) => g.titulo));

    // Dashboard é o primeiro item e não está dentro de nenhum <button>
    // de grupo — é um link direto, filho do próprio <nav>.
    const dashboard = sidebar(page).getByRole("link", { name: "Dashboard" });
    await expect(dashboard).toBeVisible();
  });

  test("dentro de cada grupo, os itens aparecem em ordem alfabética", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    for (const grupo of GRUPOS_ESPERADOS) {
      const ordenado = [...grupo.itens].sort((a, b) => a.localeCompare(b, "pt-BR"));
      expect(grupo.itens, `grupo "${grupo.titulo}"`).toEqual(ordenado);
    }
  });

  test("grupos nascem expandidos, com aria-expanded=true e os itens visíveis", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    for (const grupo of GRUPOS_ESPERADOS) {
      const botao = sidebar(page).getByRole("button", { name: grupo.titulo });
      await expect(botao).toHaveAttribute("aria-expanded", "true");
      for (const label of grupo.itens) {
        // Escopado a "a, span[title]" (nunca ao <button> do cabeçalho do
        // grupo, cujo texto pode colidir com um item do mesmo nome —
        // caso real: o grupo "Configurações" contém o item
        // "Configurações").
        const item = sidebar(page)
          .locator("a, span[title]")
          .filter({ hasText: new RegExp(`^${label}$`) });
        await expect(item).toBeVisible();
      }
    }
  });

  test("clicar no cabeçalho recolhe o grupo (aria-expanded=false, itens somem) e clicar de novo expande", async ({
    page,
  }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    const botao = sidebar(page).getByRole("button", { name: "Configurações" });
    await botao.click();
    await expect(botao).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar(page).getByRole("link", { name: "Manutenção" })).toHaveCount(0);

    await botao.click();
    await expect(botao).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar(page).getByRole("link", { name: "Manutenção" })).toBeVisible();
  });

  test("a preferência de grupo recolhido persiste depois de recarregar a página", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    await sidebar(page).getByRole("button", { name: "Cadastros e organização" }).click();
    await expect(sidebar(page).getByRole("button", { name: "Cadastros e organização" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    await page.reload();
    await expect(sidebar(page).getByRole("button", { name: "Cadastros e organização" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    // Limpeza — não deixar a preferência recolhida afetando outros testes
    // desta mesma suíte (localStorage é por origem, sobrevive entre specs).
    await sidebar(page).getByRole("button", { name: "Cadastros e organização" }).click();
  });

  test("navegar para uma rota de um grupo recolhido reabre o grupo automaticamente", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    const botaoConfig = sidebar(page).getByRole("button", { name: "Configurações" });
    await botaoConfig.click();
    await expect(botaoConfig).toHaveAttribute("aria-expanded", "false");

    // Navegação direta (não um clique no item, que já estaria escondido)
    // para uma rota dentro do grupo recolhido.
    await page.goto("/app/configuracoes");
    await expect(botaoConfig).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveText("Configurações");

    // Ao sair do grupo, a preferência (recolhido) volta a valer.
    await page.goto("/app/imoveis");
    await expect(botaoConfig).toHaveAttribute("aria-expanded", "false");

    // Limpeza.
    await botaoConfig.click();
  });

  test("os cabeçalhos de grupo são alcançáveis por teclado", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    const botao = sidebar(page).getByRole("button", { name: "Gestão comercial" });
    await botao.focus();
    await expect(botao).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(botao).toHaveAttribute("aria-expanded", "false");

    // Limpeza.
    await page.keyboard.press("Enter");
    await expect(botao).toHaveAttribute("aria-expanded", "true");
  });

  test("o menu mobile mostra os mesmos 4 grupos", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await login(page, ORG_A);
    await page.goto("/app");

    await page.getByRole("button", { name: "Abrir menu" }).click();
    const navMobile = page.getByRole("dialog").locator('nav[aria-label="Navegação principal"]');
    const titulosGrupo = await navMobile
      .getByRole("button")
      .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
    expect(titulosGrupo).toEqual(GRUPOS_ESPERADOS.map((g) => g.titulo));
  });
});

import { test, expect } from "@playwright/test";
import { ORG_A, ORG_RESTRITA_ANA, login } from "./helpers";

// Fase 62 — a sidebar do painel ganhou ícones em todos os itens e passou a
// destacar a rota atual (o menu mobile já destacava desde a Fase 26; o
// desktop não, porque o layout é Server Component e não tem usePathname).
//
// O RISCO desta mudança não é visual: a lista de navegação é recortada por
// papel e por módulo, e o <nav> desktop foi extraído para um componente de
// cliente. Por isso a maior parte da cobertura abaixo é sobre o que NÃO
// podia mudar — quais itens aparecem, para quem, e apontando para onde.

const ITENS_ESPERADOS_OWNER = [
  "Dashboard",
  "Imóveis",
  "Clientes",
  "Pipeline",
  "Agenda",
  "Analytics",
  "Minhas comissões",
  "Contatos a identificar",
  "Empreendimentos",
  "Características",
  "Tipos de imóvel",
  "Usuários",
  "Meu perfil público",
  "Configurações",
  "Assinatura",
  "Manutenção",
];

function sidebar(page: import("@playwright/test").Page) {
  return page.locator('aside nav[aria-label="Navegação principal"]');
}

test.describe("Sidebar do painel — itens e autorização", () => {
  test("o OWNER vê os mesmos itens de sempre, na mesma ordem", async ({ page }) => {
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

  test("os ícones têm o mesmo tamanho e são decorativos", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    const svgs = sidebar(page).locator("svg");
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
      .locator("svg")
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

test.describe("Sidebar do painel — agrupamento visual (Fase 63)", () => {
  test("há respiro entre grupos, sem título e sem divisor", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    const espacos = await sidebar(page)
      .locator("a, span[title]")
      .evaluateAll((els) =>
        els.map((el) => ({
          label: (el.textContent ?? "").replace(/\s*Pro\s*$/, "").trim(),
          margem: Math.round(parseFloat(getComputedStyle(el).marginTop)),
        }))
      );

    // Os quatro itens que abrem um grupo têm respiro; os outros não.
    const comRespiro = espacos.filter((e) => e.margem >= 8).map((e) => e.label);
    expect(comRespiro).toEqual([
      "Analytics",
      "Empreendimentos",
      "Usuários",
      "Configurações",
    ]);

    // O primeiro item nunca ganha respiro — separaria o menu de nada.
    expect(espacos[0].label).toBe("Dashboard");
    expect(espacos[0].margem).toBeLessThan(8);

    // Discreto: nada de divisor pesado nem cabeçalho de grupo.
    const divisores = await sidebar(page).locator("hr").count();
    expect(divisores).toBe(0);
  });

  test("o agrupamento não mexeu em itens, ordem, rotas nem permissões", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    // Mesma lista, mesma ordem que a Fase 62 fixou.
    const rotulos = await sidebar(page)
      .locator("a, span[title]")
      .evaluateAll((els) => els.map((el) => (el.textContent ?? "").replace(/\s*Pro\s*$/, "").trim()));
    expect(rotulos).toEqual(ITENS_ESPERADOS_OWNER);
  });
});

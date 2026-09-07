import { test, expect } from "@playwright/test";
import {
  ORG_A,
  ORG_ANALYTICS,
  ORG_RESTRITA,
  ORG_RESTRITA_ANA,
  ORG_RESTRITA_BRUNO,
  entrarComo,
  login,
} from "./helpers";

// =======================================================================
// Analytics sob a política de visibilidade (Fase 23)
// =======================================================================
// Organização G é a única RESTRITA. Ana conduz um negócio ganho de
// R$ 450.000 com comissão dividida: R$ 12.000 dela, R$ 6.000 do Bruno, e
// R$ 5.000 já pagos a ela.
//
// A matriz completa (política × papel) e a semântica métrica a métrica
// estão em 27 testes de integração. Aqui prova-se o que só o navegador
// prova: que a tela troca de conteúdo e não vaza agregado organizacional.

// Títulos REAIS das seções organizacionais (CardTitle renderiza <div>,
// achado da Fase 17 — por isso o seletor é por data-slot, não por role).
// A checagem é sobre a presença das SEÇÕES, não de substrings: o próprio
// texto que explica a ausência cita "visualizações", "WhatsApp" e
// "origem dos contatos", e proibir a palavra reprovaria a explicação.
const SECOES_ORGANIZACIONAIS = [
  "Funil digital",
  "Origem dos contatos",
  "Imóveis com mais movimento",
  "Canal de aquisição",
];

const secao = (page: import("@playwright/test").Page, titulo: string) =>
  page.locator('[data-slot="card-title"]', { hasText: titulo });

test.describe("RESTRICTED — corretor vê a própria carteira", () => {
  test("a tela declara o escopo e mostra só o que tem dono", async ({ page }) => {
    await login(page, ORG_RESTRITA_ANA);
    await page.goto("/app/analytics");

    // Escopo em TEXTO, não só um filtro silencioso.
    await expect(page.getByText("Minha carteira — os números abaixo são apenas seus.")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Minha participação na comissão" })
    ).toBeVisible();

    const texto = (await page.locator("main").innerText()).replace(/ /g, " ");
    // O rótulo honesto: responsável ATUAL, não "produzido por você".
    expect(texto).toContain("Negociações atualmente sob sua responsabilidade");

    // Os números dela.
    expect(texto).toContain("450.000");
    expect(texto).toContain("12.000");
    expect(texto).toContain("5.000");
  });

  test("nenhuma métrica organizacional vaza para o corretor", async ({ page }) => {
    await login(page, ORG_RESTRITA_ANA);
    await page.goto("/app/analytics");
    const texto = (await page.locator("main").innerText()).replace(/ /g, " ");

    for (const titulo of SECOES_ORGANIZACIONAIS) {
      await expect(secao(page, titulo)).toHaveCount(0);
    }
    // E a tela não se apresenta como visão da imobiliária.
    expect(texto).not.toContain("Visão da imobiliária");

    // Em vez de sumir em silêncio, ela explica a ausência.
    await expect(page.getByRole("heading", { name: "O que não aparece nesta visão" })).toBeVisible();
  });

  test("a comissão do outro corretor nunca aparece na minha participação", async ({ page }) => {
    await login(page, ORG_RESTRITA_BRUNO);
    await page.goto("/app/analytics");
    const doBruno = (await page.locator("main").innerText()).replace(/ /g, " ");

    // Bruno é beneficiário de R$ 6.000 — e não conduziu o negócio.
    expect(doBruno).toContain("6.000");
    expect(doBruno).not.toContain("12.000");
    // Ele não recebeu nada no período.
    expect(doBruno).toContain("Minha participação na comissão");
  });

  test("o período continua sendo escolhível e o escopo não muda", async ({ page }) => {
    await login(page, ORG_RESTRITA_ANA);
    await page.goto("/app/analytics?periodo=7d");
    await expect(page.getByText("Minha carteira — os números abaixo são apenas seus.")).toBeVisible();
    for (const titulo of SECOES_ORGANIZACIONAIS) {
      await expect(secao(page, titulo)).toHaveCount(0);
    }
  });
});

test.describe("RESTRICTED — gestor mantém a visão da imobiliária", () => {
  test("o OWNER continua com o Analytics organizacional completo", async ({ page }) => {
    await login(page, ORG_RESTRITA);
    await page.goto("/app/analytics");

    const texto = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(texto).toContain("Visão da imobiliária");
    // As seções organizacionais estão todas lá.
    for (const titulo of SECOES_ORGANIZACIONAIS) {
      await expect(secao(page, titulo)).toBeVisible();
    }
    // ... e a visão pessoal não se mistura com elas.
    expect(texto).not.toContain("Minha carteira — os números abaixo são apenas seus.");
  });
});

test.describe("COLLABORATIVE — nada regride", () => {
  test("na organização de Analytics o comportamento histórico é preservado", async ({ page }) => {
    // Org D é COLLABORATIVE e é onde analytics.spec.ts afirma números
    // absolutos há várias fases. Se a Fase 23 tivesse mexido no caminho
    // organizacional, seria aqui que apareceria.
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/analytics");
    const texto = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(texto).toContain("Visão da imobiliária");
    await expect(secao(page, "Funil digital")).toBeVisible();
  });
});

test.describe("gate de Configurações (dívida da Fase 22, fechada)", () => {
  test("o corretor não recebe mais a tela de Configurações", async ({ page }) => {
    await login(page, ORG_RESTRITA_ANA);
    await page.goto("/app/configuracoes");

    await expect(
      page.getByText("Apenas administradores podem alterar as configurações da imobiliária.")
    ).toBeVisible();
    // Nenhum dado de configuração é carregado.
    await expect(page.locator("#timezone")).toHaveCount(0);
    await expect(page.locator("#visibilidade-RESTRICTED")).toHaveCount(0);
  });

  test("o OWNER continua acessando normalmente", async ({ page }) => {
    await login(page, ORG_RESTRITA);
    await page.goto("/app/configuracoes");
    await expect(page.locator("#timezone")).toBeVisible();
    await expect(page.locator("#visibilidade-RESTRICTED")).toBeChecked();
  });

  test("na Org A (colaborativa) o OWNER também continua acessando", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");
    await expect(page.locator("#timezone")).toBeVisible();
  });
});

test.describe("responsividade da carteira", () => {
  test("sem overflow em 375/390/430/768/1024/1280/1440", async ({ page }) => {
    await entrarComo(page, ORG_RESTRITA_ANA);
    for (const largura of [375, 390, 430, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/analytics");
      await expect(page.getByRole("heading", { name: "Minhas negociações" })).toBeVisible();
      const rolagemX = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolagemX, `rolou ${rolagemX}px em ${largura}px`).toBe(0);
    }
  });
});

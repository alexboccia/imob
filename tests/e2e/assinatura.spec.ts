import { test, expect, type Page } from "@playwright/test";
import { login, entrarComo, ORG_TRIAL, ORG_VENCIDA, ORG_ACESSO_CORRETOR } from "./helpers";

// =======================================================================
// Assinatura (Fase 27; alinhamento visual na Fase 75)
// =======================================================================
// O produto ainda NÃO cobra — não há provedor de pagamento, e escolher
// um é decisão comercial que o repositório não contém. O que estes
// testes protegem é o que já precisa ser verdade antes de qualquer
// cobrança existir:
//
//   a imobiliária enxerga o próprio contrato;
//   o trial vencido NÃO é um beco sem saída;
//   quem não responde pelo contrato não chega até ele.
//
// Fase 75 — "Imóveis ativos: 11 de 1000" e "Mensalidade: R$ 499,00" eram
// texto corrido com dois-pontos; agora rótulo e valor são elementos
// separados de CartaoEstatistica (data-kpi-rotulo/data-kpi-valor), o
// mesmo cartão de indicador usado no resto do backoffice. `kpi()` ancora
// nesses atributos em vez de um regex de texto corrido — mudança
// estrutural legítima (o dado é o mesmo, só a marcação mudou), não um
// enfraquecimento: continua provando que o valor REAL do banco aparece
// na tela, agora de um jeito que resiste a reflow de texto.
function kpi(page: Page, rotulo: string) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.locator("[data-kpi-rotulo]", { hasText: rotulo }) })
    .locator("[data-kpi-valor]");
}

test.describe("contrato visível", () => {
  test("o dono vê plano, prazo do trial e limites reais", async ({ page }) => {
    await login(page, ORG_TRIAL);

    await expect(page.getByRole("link", { name: "Assinatura" })).toBeVisible();
    await page.goto("/app/assinatura");

    await expect(page.getByRole("heading", { name: "Assinatura" })).toBeVisible();
    await expect(page.getByText("Período de avaliação").first()).toBeVisible();
    // Prazo e limites vêm do banco, não de texto fixo.
    await expect(page.getByText(/Período de avaliação até/)).toBeVisible();
    await expect(kpi(page, "Imóveis ativos")).toBeVisible();
    await expect(kpi(page, "Usuários ativos")).toBeVisible();
    // Mensalidade do catálogo — o plano de entrada é gratuito.
    await expect(kpi(page, "Mensalidade")).toBeVisible();
  });

  test("a tela não finge que existe contratação dentro do produto", async ({ page }) => {
    await login(page, ORG_TRIAL);
    await page.goto("/app/assinatura");

    // Um botão "Assinar" que não cobra nada seria pior que a ausência
    // dele: prometeria um caminho que não existe.
    await expect(page.getByRole("button", { name: /Assinar|Pagar|Contratar/ })).toHaveCount(0);
    await expect(page.getByText(/definição comercial que ainda não está no produto/)).toBeVisible();
  });
});

test.describe("trial vencido não prende a imobiliária", () => {
  test("a operação para, mas a assinatura continua alcançável", async ({ page }) => {
    await login(page, ORG_VENCIDA);

    // A operação normal está bloqueada.
    await page.goto("/app/imoveis");
    await page.waitForURL(/\/app\/trial-expirado/);
    await expect(page.getByRole("heading", { name: /período de avaliação terminou/i })).toBeVisible();

    // E existe uma saída — antes desta fase a tela só oferecia "Sair".
    await page.getByRole("link", { name: "Ver minha assinatura" }).click();
    await page.waitForURL(/\/app\/assinatura/);

    await expect(page.getByRole("heading", { name: "Assinatura" })).toBeVisible();
    // A tela diz a verdade sobre o bloqueio, com a data real.
    await expect(page.getByText(/Seu período de avaliação terminou em/)).toBeVisible();
  });

  test("mesmo bloqueada, a organização vê plano e limites", async ({ page }) => {
    await login(page, ORG_VENCIDA);
    await page.goto("/app/assinatura");

    await expect(kpi(page, "Imóveis ativos")).toBeVisible();
    await expect(kpi(page, "Mensalidade")).toBeVisible();
  });
});

test.describe("autorização financeira", () => {
  test("um corretor não vê nem alcança a assinatura", async ({ page }) => {
    await entrarComo(page, ORG_ACESSO_CORRETOR);

    // Gerir carteira não dá autoridade sobre o contrato.
    await expect(page.getByRole("link", { name: "Assinatura" })).toHaveCount(0);

    await page.goto("/app/assinatura");
    await page.waitForURL(/\/app$/);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("a assinatura cabe numa viewport estreita", async ({ page }) => {
    await login(page, ORG_TRIAL);
    await page.goto("/app/assinatura");

    await expect(page.getByRole("heading", { name: "Assinatura" })).toBeVisible();
    const larguras = await page.evaluate(() => ({
      conteudo: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(larguras.conteudo).toBeLessThanOrEqual(larguras.viewport);
  });
});

// =======================================================================
// Redesenho visual — sistema de backoffice (Fase 75)
// =======================================================================
// A garantia de negócio (dado vem do banco, trial não prende a
// organização, autorização financeira) já está coberta acima e continua
// passando com a MESMA regra — só os helpers de localização das duas
// primeiras asserções migraram de texto corrido ("Imóveis ativos: 11 de
// 1000") para os atributos data-kpi-rotulo/data-kpi-valor do cartão de
// indicador compartilhado (ver `kpi()` no topo do arquivo).

test.describe("estrutura da tela redesenhada (Fase 75)", () => {
  test("hierarquia de cabeçalhos: h1 -> dois h2, sem h3", async ({ page }) => {
    await login(page, ORG_TRIAL);
    await page.goto("/app/assinatura");

    await expect(page.getByRole("heading", { level: 1, name: "Assinatura" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2, name: /Trial E2E/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Contratação" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  });

  // "Mudar de plano" prometia uma ação que a seção nunca ofereceu — não
  // existe troca de plano de autoatendimento (quem promove um plano é o
  // Super Admin, ver alterarPlano). "Contratação" descreve o que a seção
  // realmente é: como a contratação funciona hoje.
  test("a seção se chama 'Contratação', não mais 'Mudar de plano'", async ({ page }) => {
    await login(page, ORG_TRIAL);
    await page.goto("/app/assinatura");

    await expect(page.getByRole("heading", { name: "Contratação" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mudar de plano" })).toHaveCount(0);
  });

  test("nenhuma capacidade de billing inexistente foi inventada", async ({ page }) => {
    await login(page, ORG_TRIAL);
    await page.goto("/app/assinatura");

    for (const rotulo of [
      "Fazer upgrade",
      "Alterar plano",
      "Gerenciar pagamento",
      "Adicionar cartão",
      "Cancelar assinatura",
      "Renovar assinatura",
      "Falar com vendas",
      "Contratar agora",
      "Escolher plano",
    ]) {
      await expect(page.getByRole("button", { name: rotulo })).toHaveCount(0);
      await expect(page.getByRole("link", { name: rotulo })).toHaveCount(0);
    }
  });

  // Usuários ativos "1 de 1" é o LIMITE atingido de verdade nesta
  // fixture (ORG_TRIAL) — a tela mostra o fato sem inventar alerta
  // (sem "limite atingido!", sem cor de aviso): o domínio não define
  // nenhum limiar de alerta, só o enforcement real no servidor.
  test("limite atingido (1 de 1) é mostrado como fato, sem alerta inventado", async ({
    page,
  }) => {
    await login(page, ORG_TRIAL);
    await page.goto("/app/assinatura");

    await expect(kpi(page, "Usuários ativos")).toHaveText("1");
    await expect(page.getByText(/limite atingido/i)).toHaveCount(0);
    await expect(page.getByText(/você excedeu/i)).toHaveCount(0);
  });
});

test.describe("responsivo (Fase 75)", () => {
  // Larguras alinhadas ao conjunto canônico já usado nas demais páginas
  // redesenhadas do backoffice.
  for (const largura of [1920, 1440, 1366, 1024, 768, 390]) {
    test(`${largura}px: sem overflow e sem truncamento`, async ({ page }) => {
      await login(page, ORG_TRIAL);
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/assinatura");

      await expect(page.getByRole("heading", { level: 1, name: "Assinatura" })).toBeVisible();

      const semOverflowDocumento = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflowDocumento, `overflow horizontal do documento em ${largura}px`).toBe(true);

      const medidas = await page
        .locator("[data-kpi-rotulo], [data-kpi-valor]")
        .evaluateAll((els) =>
          els.map((el) => ({
            texto: (el.textContent ?? "").trim(),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          }))
        );
      expect(medidas.length).toBe(6); // 3 rótulos + 3 valores
      for (const m of medidas) {
        expect(
          m.scrollWidth,
          `"${m.texto}" cortado em ${largura}px`
        ).toBeLessThanOrEqual(m.clientWidth + 1);
      }
    });
  }
});

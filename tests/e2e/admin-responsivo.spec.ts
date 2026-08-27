import { test, expect, type Page } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// Responsividade completa do painel administrativo — cobertura
// ESTRUTURAL por rota (não duplica os fluxos funcionais já cobertos nos
// specs dedicados de cada tela: imoveis.spec.ts, clientes.spec.ts,
// pipeline.spec.ts, agenda.spec.ts, caracteristicas.spec.ts,
// tipos-imovel.spec.ts, usuarios.spec.ts, configuracoes.spec.ts,
// manutencao.spec.ts, dashboard.spec.ts — todos continuam existindo e
// rodando). Aqui: cada rota administrativa, nos 5 breakpoints pedidos,
// sem overflow horizontal e com o <h1> real, visível e íntegro (sem
// quebra caractere-a-caractere) — o critério estrutural mínimo definido
// pra esta tarefa.
const ROTAS: { path: string; titulo: string }[] = [
  { path: "/app", titulo: "Dashboard" },
  { path: "/app/imoveis", titulo: "Imóveis" },
  { path: "/app/clientes", titulo: "Clientes" },
  { path: "/app/pipeline", titulo: "Pipeline" },
  { path: "/app/agenda", titulo: "Agenda" },
  { path: "/app/caracteristicas", titulo: "Características" },
  { path: "/app/tipos-imovel", titulo: "Tipos de imóvel" },
  { path: "/app/usuarios", titulo: "Usuários" },
  { path: "/app/configuracoes", titulo: "Configurações" },
  { path: "/app/manutencao", titulo: "Manutenção" },
];

const BREAKPOINTS = [360, 375, 768, 1024, 1440];

async function medirOverflow(page: Page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
}

test.describe("Responsividade do painel administrativo", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
  });

  for (const rota of ROTAS) {
    test.describe(rota.titulo, () => {
      for (const width of BREAKPOINTS) {
        test(`${width}px: sem overflow, título íntegro e visível`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(rota.path);

          const heading = page.getByRole("heading", { level: 1, name: rota.titulo });
          await expect(heading).toBeVisible();
          await expect(heading).toHaveText(rota.titulo);

          const m = await medirOverflow(page);
          expect(
            m.scrollWidth <= m.innerWidth + 1,
            `${rota.path}@${width}px: innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
          ).toBe(true);

          // Título não pode quebrar caractere a caractere (altura da 1a
          // linha compatível com uma única linha de texto, não uma coluna
          // de 1 letra) — mesma checagem estrutural usada nas telas já
          // auditadas individualmente nesta sessão.
          const box = await heading.boundingBox();
          const lineHeight = await heading.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight || "28"));
          expect(box, "título sem bounding box (não renderizado)").not.toBeNull();
          if (box) {
            const linhasAprox = Math.round(box.height / lineHeight);
            expect(linhasAprox, `título "${rota.titulo}" com ${linhasAprox} linhas em ${width}px`).toBeLessThanOrEqual(2);
          }

          // Nav: sidebar fora do fluxo abaixo de 768, hamburger visível;
          // sidebar visível a partir de 768, hamburger ausente.
          if (width < 768) {
            await expect(page.locator("aside")).toBeHidden();
            await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
          } else {
            await expect(page.locator("aside")).toBeVisible();
            await expect(page.getByRole("button", { name: "Abrir menu" })).toBeHidden();
          }
        });
      }
    });
  }
});

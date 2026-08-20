import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// 9. navegação mobile básica
//
// O painel autenticado (src/app/app/layout.tsx) ainda não tem um menu
// hambúrguer/drawer dedicado pra mobile — é uma <aside> de largura fixa.
// Então o teste "básico" pragmático aqui é: em viewport mobile, a
// navegação continua visível, sem overflow horizontal quebrando o layout,
// e os links continuam clicáveis/funcionais.
test.use({ viewport: { width: 375, height: 667 } });

test("navegação principal funciona em viewport mobile", async ({ page }) => {
  await login(page, ORG_A);

  const nav = page.locator("nav");
  await expect(nav).toBeVisible();
  await expect(page.getByRole("link", { name: "Imóveis" })).toBeVisible();

  // Diagnóstico instrumentado (temporário) — investigação do overflow
  // intermitente visto na CI (mobile-nav.spec.ts, viewport 375x667). Não
  // altera a asserção original; apenas coleta geometria/timing pra log,
  // sem PII (só tagName/className/id/coordenadas). Ver commit message.
  const diagnosticoCompleto = await page.evaluate(async () => {
    function medidas() {
      return {
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        dpr: window.devicePixelRatio,
      };
    }

    function descreve(el: Element | null) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: (el.getAttribute("class") ?? "").slice(0, 140),
        id: el.id || undefined,
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
      };
    }

    function scanOverflow() {
      const vw = window.innerWidth;
      const out: ReturnType<typeof descreve>[] = [];
      document.querySelectorAll("*").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) {
          out.push(descreve(el));
        }
      });
      return out.sort((a, b) => (b?.right ?? 0) - (a?.right ?? 0)).slice(0, 20);
    }

    function elementosEspecificos() {
      const filterRowBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        ["Status", "Tipo", "Bairro"].includes(b.textContent?.trim() ?? "")
      );
      const cards = Array.from(
        document.querySelectorAll('main [class*="overflow-hidden"][class*="rounded-xl"]')
      );
      const cardHeaders = Array.from(document.querySelectorAll('[class*="card-header"]'));
      const svgs = Array.from(document.querySelectorAll(".recharts-wrapper svg"));
      const yAxes = Array.from(document.querySelectorAll(".recharts-yAxis"));

      return {
        aside: descreve(document.querySelector("aside")),
        main: descreve(document.querySelector("main")),
        containerFlexPrincipal: descreve(
          document.querySelector('[class*="min-w-0"][class*="flex-1"]')
        ),
        cards: cards.map(descreve),
        cardHeaders: cardHeaders.map(descreve),
        filterRow: descreve(filterRowBtn ? filterRowBtn.closest("div") : null),
        svgs: svgs.map(descreve),
        yAxes: yAxes.map(descreve),
      };
    }

    const readyStateAntes = document.readyState;
    const medidasAntes = medidas();
    const scanAntes = scanOverflow();
    const elementosAntes = elementosEspecificos();

    await document.fonts.ready;

    const medidasDepois = medidas();
    const scanDepois = scanOverflow();
    const elementosDepois = elementosEspecificos();

    return {
      readyStateAntes,
      medidasAntes,
      scanAntes,
      elementosAntes,
      medidasDepois,
      scanDepois,
      elementosDepois,
    };
  });

  // Prefixo estável pra localizar/gre-par no log da CI.
  console.log("MOBILE_OVERFLOW_DIAGNOSTIC:" + JSON.stringify(diagnosticoCompleto));

  // Sem overflow horizontal (scrollWidth não deve passar do viewport).
  const semOverflowHorizontal = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  expect(semOverflowHorizontal).toBe(true);

  await page.getByRole("link", { name: "Imóveis" }).click();
  await page.waitForURL("/app/imoveis");
  await expect(page.getByRole("heading", { name: "Imóveis" })).toBeVisible();
});

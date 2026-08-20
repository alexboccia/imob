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

  // Diagnóstico instrumentado (temporário) — investigação cirúrgica dos
  // +2px de overflow vistos na CI (scrollWidth=377 vs innerWidth=375),
  // que não reproduzem localmente. A rodada anterior (top-20 por maior
  // `right`) mascarou o elemento real: ficou dominada pelo filter-row
  // (que já é contido por overflow-hidden do Card) e seus dezenas de
  // sub-elementos SVG do Recharts. Esta rodada troca isso por: (a) scan
  // focado na faixa 376-390px de cada lado, (b) busca recursiva que
  // oculta subtrees uma a uma (display:none, sempre restaurado antes de
  // seguir) até isolar qual delas faz scrollWidth cair de volta pra
  // <=376 — a assertão original roda depois, intacta, com o DOM já
  // restaurado. Não altera código de produção.
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
      const he = el as HTMLElement;
      return {
        tag: el.tagName,
        cls: (el.getAttribute("class") ?? "").slice(0, 140),
        id: el.id || undefined,
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        offsetWidth: "offsetWidth" in he ? he.offsetWidth : undefined,
        clientWidth: he.clientWidth,
        scrollWidthEl: he.scrollWidth,
      };
    }

    function ancestorInfo(el: Element) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: (el.getAttribute("class") ?? "").slice(0, 140),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        overflow: cs.overflow,
        overflowX: cs.overflowX,
        position: cs.position,
        transform: cs.transform,
        contain: cs.contain,
        clipPath: cs.clipPath,
      };
    }

    function cadeiaAncestrais(el: Element | null, ateBody = true) {
      const cadeia = [];
      let atual = el?.parentElement ?? null;
      let profundidade = 0;
      while (atual && profundidade < 15) {
        cadeia.push(ancestorInfo(atual));
        if (ateBody && atual === document.body) break;
        atual = atual.parentElement;
        profundidade++;
      }
      return cadeia;
    }

    function pseudoInfo(el: Element, which: "::before" | "::after") {
      const cs = getComputedStyle(el, which);
      const contentRaw = cs.content;
      const hasContent = contentRaw !== "none" && contentRaw !== "";
      return {
        display: cs.display,
        position: cs.position,
        width: cs.width,
        left: cs.left,
        right: cs.right,
        transform: cs.transform,
        hasContent,
      };
    }

    // --- 3/4: scan geral + faixa crítica 376-390px, dos dois lados ---
    function scanFaixaCritica() {
      const vw = window.innerWidth;
      const todos: ReturnType<typeof descreve>[] = [];
      const faixaCritica: ReturnType<typeof descreve>[] = [];
      const overflowEsquerda: ReturnType<typeof descreve>[] = [];
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1) {
          const d = descreve(el);
          todos.push(d);
          if (r.right >= 376 && r.right <= 390) faixaCritica.push(d);
        }
        if (r.left < -1) {
          overflowEsquerda.push(descreve(el));
        }
      });
      return { totalElementosComOverflow: todos.length, faixaCritica, overflowEsquerda };
    }

    // --- 7: positioned elements perto/além da borda ---
    function scanPosicionados() {
      const vw = window.innerWidth;
      const out: ReturnType<typeof descreve>[] = [];
      document.querySelectorAll("body *").forEach((el) => {
        const cs = getComputedStyle(el);
        if (["absolute", "fixed", "sticky"].includes(cs.position)) {
          const r = el.getBoundingClientRect();
          if (r.right > vw || r.left < 0) {
            out.push(descreve(el));
          }
        }
      });
      return out.slice(0, 20);
    }

    // --- 8: transforms perto da borda ---
    function scanTransforms() {
      const vw = window.innerWidth;
      const out: ReturnType<typeof descreve>[] = [];
      document.querySelectorAll("body *").forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.transform !== "none") {
          const r = el.getBoundingClientRect();
          if (r.right > vw - 20 || r.left < 20) {
            out.push(descreve(el));
          }
        }
      });
      return out.slice(0, 20);
    }

    // --- 9: SVG raiz + primeiro ancestor com clipping ---
    function scanSvgRaizes() {
      const raizes = Array.from(document.querySelectorAll(".recharts-wrapper svg, svg:not(svg svg)"));
      return raizes.slice(0, 10).map((svg) => {
        let ancestor = svg.parentElement;
        let ancestorClip = null;
        while (ancestor && ancestor !== document.body) {
          const cs = getComputedStyle(ancestor);
          if (cs.overflow === "hidden" || cs.overflowX === "hidden" || cs.overflow === "clip") {
            ancestorClip = ancestorInfo(ancestor);
            break;
          }
          ancestor = ancestor.parentElement;
        }
        return {
          svg: descreve(svg),
          viewBox: svg.getAttribute("viewBox"),
          ancestorClipping: ancestorClip,
        };
      });
    }

    // --- 10: html/body computed ---
    function htmlBodyComputed() {
      const csHtml = getComputedStyle(document.documentElement);
      const csBody = getComputedStyle(document.body);
      return {
        html: {
          margin: csHtml.margin,
          padding: csHtml.padding,
          width: csHtml.width,
          minWidth: csHtml.minWidth,
          overflowX: csHtml.overflowX,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        },
        body: {
          margin: csBody.margin,
          padding: csBody.padding,
          width: csBody.width,
          minWidth: csBody.minWidth,
          overflowX: csBody.overflowX,
          scrollWidth: document.body.scrollWidth,
          clientWidth: document.body.clientWidth,
        },
      };
    }

    // --- 11: filhos diretos de body e main ---
    function filhosDiretos() {
      return {
        body: Array.from(document.body.children).map(descreve),
        main: Array.from(document.querySelectorAll("main")).flatMap((m) =>
          Array.from(m.children).map(descreve)
        ),
      };
    }

    // --- 12/13: isolamento recursivo por ocultação (destrutivo, sempre
    // restaurado antes de seguir pro próximo candidato ou retornar) ---
    function medirOcultando(el: HTMLElement) {
      const originalVisibility = el.style.visibility;
      const originalDisplay = el.style.display;

      el.style.visibility = "hidden";
      const swVisibility = document.documentElement.scrollWidth;
      el.style.visibility = originalVisibility;

      el.style.display = "none";
      const swDisplay = document.documentElement.scrollWidth;
      el.style.display = originalDisplay;

      return { swVisibility, swDisplay };
    }

    function isolarCausador(
      el: HTMLElement,
      profundidade: number,
      limiar: number,
      demo: unknown[]
    ): {
      encontrado: boolean;
      elemento?: ReturnType<typeof descreve>;
      profundidade?: number;
      scrollWidthSemEle?: number;
      trilha?: { nivel: number; tag: string; cls: string; swAoOcultar: number }[];
    } {
      if (profundidade > 10) return { encontrado: false };
      const filhos = Array.from(el.children) as HTMLElement[];
      const trilha: { nivel: number; tag: string; cls: string; swAoOcultar: number }[] = [];

      for (const filho of filhos) {
        const { swVisibility, swDisplay } = medirOcultando(filho);
        if (profundidade === 0) {
          demo.push({
            tag: filho.tagName,
            cls: (filho.getAttribute("class") ?? "").slice(0, 80),
            swVisibility,
            swDisplay,
          });
        }
        trilha.push({
          nivel: profundidade,
          tag: filho.tagName,
          cls: (filho.getAttribute("class") ?? "").slice(0, 80),
          swAoOcultar: swDisplay,
        });

        if (swDisplay <= limiar) {
          const sub = isolarCausador(filho, profundidade + 1, limiar, demo);
          if (sub.encontrado) {
            return { ...sub, encontrado: true, trilha: [...trilha, ...(sub.trilha ?? [])] };
          }
          return {
            encontrado: true,
            elemento: descreve(filho),
            profundidade,
            scrollWidthSemEle: swDisplay,
            trilha,
          };
        }
      }
      return { encontrado: false, trilha };
    }

    // ===================== execução =====================

    const readyStateAntes = document.readyState;
    const medidasAntes = medidas();
    const faixaCriticaAntes = scanFaixaCritica();
    const posicionados = scanPosicionados();
    const transforms = scanTransforms();
    const svgs = scanSvgRaizes();
    const htmlBody = htmlBodyComputed();
    const filhos = filhosDiretos();

    await document.fonts.ready;

    const medidasDepoisFonts = medidas();
    const faixaCriticaDepois = scanFaixaCritica();

    // Estabilidade temporal (0/100/250/500/1000ms)
    const estabilidade: { t: number; scrollWidth: number }[] = [];
    const tempos = [0, 100, 250, 500, 1000];
    for (const t of tempos) {
      if (t > 0) await new Promise((r) => setTimeout(r, t - (tempos[tempos.indexOf(t) - 1] ?? 0)));
      estabilidade.push({ t, scrollWidth: document.documentElement.scrollWidth });
    }

    // Busca recursiva pelo elemento causador (destrutivo, sempre restaurado).
    // Só faz sentido rodar se HÁ overflow real agora — senão qualquer
    // elemento hipoteticamente "resolve" o já-resolvido, dando falso
    // positivo (visto localmente: scrollWidth já é 375, então ocultar o
    // primeiro <script> da lista trivialmente "mantém" 375<=376).
    const limiar = medidasDepoisFonts.innerWidth + 1;
    const haOverflowReal = medidasDepoisFonts.scrollWidth > limiar;
    const demoVisibilityVsDisplay: unknown[] = [];
    const resultadoIsolamento = haOverflowReal
      ? isolarCausador(document.body, 0, limiar, demoVisibilityVsDisplay)
      : { encontrado: false };

    let cadeiaDoCausador = null;
    let pseudoDoCausadorEAncestrais = null;
    if (resultadoIsolamento.encontrado) {
      // Reencontra o elemento real (o `descreve` anterior não guarda a
      // referência DOM) pra andar a cadeia de ancestrais e checar pseudo.
      // Reconstituído via trilha: última entrada é o candidato final.
      const tag = resultadoIsolamento.elemento?.tag;
      const cls = resultadoIsolamento.elemento?.cls ?? "";
      const candidato = Array.from(document.querySelectorAll(tag ? tag.toLowerCase() : "*")).find(
        (e) => (e.getAttribute("class") ?? "").slice(0, 140) === cls
      );
      if (candidato) {
        cadeiaDoCausador = cadeiaAncestrais(candidato);
        const asideEl = document.querySelector("aside");
        const mainEl = document.querySelector("main");
        pseudoDoCausadorEAncestrais = {
          elemento: {
            before: pseudoInfo(candidato, "::before"),
            after: pseudoInfo(candidato, "::after"),
          },
          html: {
            before: pseudoInfo(document.documentElement, "::before"),
            after: pseudoInfo(document.documentElement, "::after"),
          },
          body: {
            before: pseudoInfo(document.body, "::before"),
            after: pseudoInfo(document.body, "::after"),
          },
          aside: asideEl
            ? { before: pseudoInfo(asideEl, "::before"), after: pseudoInfo(asideEl, "::after") }
            : null,
          main: mainEl
            ? { before: pseudoInfo(mainEl, "::before"), after: pseudoInfo(mainEl, "::after") }
            : null,
        };
      }
    }

    // Confirma que o DOM foi 100% restaurado (nenhum style inline residual)
    const scrollWidthPosRestauracao = document.documentElement.scrollWidth;

    return {
      readyStateAntes,
      medidasAntes,
      medidasDepoisFonts,
      faixaCriticaAntes,
      faixaCriticaDepois,
      posicionados,
      transforms,
      svgs,
      htmlBody,
      filhos,
      estabilidade,
      demoVisibilityVsDisplay,
      haOverflowReal,
      resultadoIsolamento,
      cadeiaDoCausador,
      pseudoDoCausadorEAncestrais,
      scrollWidthPosRestauracao,
    };
  });

  // Prefixo estável pra localizar/grepar no log da CI.
  console.log("MOBILE_OVERFLOW_DIAGNOSTIC_V2:" + JSON.stringify(diagnosticoCompleto));

  // Sem overflow horizontal (scrollWidth não deve passar do viewport).
  // Assertion original, intacta — roda com o DOM já 100% restaurado pela
  // instrumentação acima.
  const semOverflowHorizontal = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  expect(semOverflowHorizontal).toBe(true);

  await page.getByRole("link", { name: "Imóveis" }).click();
  await page.waitForURL("/app/imoveis");
  await expect(page.getByRole("heading", { name: "Imóveis" })).toBeVisible();
});

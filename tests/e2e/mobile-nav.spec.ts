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

    // Hipótese: ResponsiveContainer do Recharts usa ResizeObserver, que
    // reage de forma assíncrona a QUALQUER reflow — não só ao elemento
    // realmente ocultado. Medido ANTES de qualquer busca por ocultação,
    // pra isolar o efeito de reflow puro (sem tocar em nada relevante)
    // do efeito de fato ocultar um elemento específico.
    const estabilidadeReflowSemOcultar: number[] = [];
    if (haOverflowReal) {
      for (let i = 0; i < 8; i++) {
        void document.body.offsetHeight;
        estabilidadeReflowSemOcultar.push(document.documentElement.scrollWidth);
      }
    }

    const demoVisibilityVsDisplay: unknown[] = [];
    // Mantido só para registro da refutação (item 1/32): esta busca TOCA
    // o aside, então "encontrar" o aside aqui não prova que ele é o
    // causador — só prova que ocultá-lo libera espaço no flex row para
    // o outro sibling (confound documentado). Ver resultadoIsolamentoMain
    // abaixo, que não toca o aside.
    const resultadoIsolamentoTocandoAside = haOverflowReal
      ? isolarCausador(document.body, 0, limiar, demoVisibilityVsDisplay)
      : { encontrado: false };

    // ================= Reabertura: busca só dentro de <main> =================
    // Nunca oculta o aside. Isola o elemento mínimo cuja remoção resolve
    // o overflow, procurando exclusivamente dentro do conteúdo real.
    function medirElemento(el: HTMLElement | null) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        offsetWidth: el.offsetWidth,
        rect: { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) },
      };
    }
    const mainEl = document.querySelector("main");
    const contentWrapperEl = mainEl?.parentElement ?? null;
    const medidaMain = medirElemento(mainEl);
    const medidaContentWrapper = medirElemento(contentWrapperEl);

    function temClippingAteBody(el: Element): boolean {
      let atual = el.parentElement;
      while (atual && atual !== document.body) {
        const cs = getComputedStyle(atual);
        if (
          cs.overflow === "hidden" ||
          cs.overflowX === "hidden" ||
          cs.overflow === "clip" ||
          cs.overflowX === "clip"
        ) {
          return true;
        }
        atual = atual.parentElement;
      }
      return false;
    }
    function candidatosReaisNaFaixa() {
      const vw = window.innerWidth;
      const out: ReturnType<typeof descreve>[] = [];
      document.querySelectorAll("main *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && !temClippingAteBody(el)) {
          out.push(descreve(el));
        }
      });
      return out.slice(0, 30);
    }
    const candidatosSemClipping = haOverflowReal ? candidatosReaisNaFaixa() : [];

    function isolarDentroDeMain(
      el: HTMLElement,
      profundidade: number,
      trilhaAcc: { nivel: number; tag: string; cls: string; swAoOcultar: number }[]
    ): { encontrado: boolean; elemento?: ReturnType<typeof descreve>; profundidade?: number; scrollWidthSemEle?: number } {
      if (profundidade > 12) return { encontrado: false };
      const filhos = Array.from(el.children) as HTMLElement[];
      for (const filho of filhos) {
        const { swDisplay } = medirOcultando(filho);
        trilhaAcc.push({
          nivel: profundidade,
          tag: filho.tagName,
          cls: (filho.getAttribute("class") ?? "").slice(0, 100),
          swAoOcultar: swDisplay,
        });
        if (swDisplay <= limiar) {
          const sub = isolarDentroDeMain(filho, profundidade + 1, trilhaAcc);
          if (sub.encontrado) return sub;
          return {
            encontrado: true,
            elemento: descreve(filho),
            profundidade,
            scrollWidthSemEle: swDisplay,
          };
        }
      }
      return { encontrado: false };
    }
    const trilhaMain: { nivel: number; tag: string; cls: string; swAoOcultar: number }[] = [];
    const resultadoIsolamentoMain =
      haOverflowReal && mainEl ? isolarDentroDeMain(mainEl, 0, trilhaMain) : { encontrado: false };

    function testarOcultacao(el: Element | null) {
      if (!el) return null;
      const he = el as HTMLElement;
      const antes = document.documentElement.scrollWidth;
      const originalDisplay = he.style.display;
      he.style.display = "none";
      const depois = document.documentElement.scrollWidth;
      he.style.display = originalDisplay;
      return { antes, depois, resolveu: depois <= limiar };
    }

    // Item 7: subtree inteira do grid de charts do dashboard.
    const chartsGrid = document.querySelector("main .grid.gap-4.mt-6");
    const testeChartsGrid = testarOcultacao(chartsGrid);
    const chartsGridComputed = chartsGrid
      ? (() => {
          const cs = getComputedStyle(chartsGrid);
          return { display: cs.display, gridTemplateColumns: cs.gridTemplateColumns, gap: cs.gap };
        })()
      : null;

    // Item 8: cada Card individualmente.
    const cards = Array.from(document.querySelectorAll('main [data-slot="card"]'));
    const testesPorCard = cards.map((card, i) => ({
      indice: i,
      titulo: card.querySelector('[data-slot="card-title"]')?.textContent?.trim() ?? null,
      ...testarOcultacao(card),
    }));

    // Item 19: @container em card-header.
    const cardHeadersComputed = Array.from(document.querySelectorAll('main [data-slot="card-header"]')).map(
      (h) => {
        const cs = getComputedStyle(h);
        return { containerType: cs.containerType, width: Math.round(h.getBoundingClientRect().width) };
      }
    );

    // Item 9: filter row (botões Status/Tipo/Bairro).
    const botaoStatus = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Status"
    );
    const filterRow = botaoStatus?.parentElement ?? null;
    const testeFilterRow = testarOcultacao(filterRow);

    // Item 10/11: Recharts YAxis do segundo BarChart (width=100).
    // ">" (filho direto), não descendente geral — senão pega os svgs de
    // ícone da legenda (32x32, dentro de .recharts-legend-wrapper) em vez
    // do svg raiz do próprio chart.
    const svgsRecharts = Array.from(document.querySelectorAll(".recharts-wrapper > svg.recharts-surface"));
    const svgComposicao = svgsRecharts[1] ?? null;
    const yAxisComposicao = svgComposicao?.querySelector(".recharts-yAxis") ?? null;
    const testeYAxis = testarOcultacao(yAxisComposicao);
    const testeSvgComposicaoInteiro = testarOcultacao(svgComposicao);
    const responsiveContainerComposicao = svgComposicao?.closest(".recharts-responsive-container") ?? null;
    const testeResponsiveContainerComposicao = testarOcultacao(responsiveContainerComposicao);

    // Achado local em 360px (fora da asserção real, não reproduz 375
    // localmente): candidatosSemClipping vem vazio (nenhum elemento tem
    // rect.right além do viewport, então não é overflow "visual"/de
    // pintura); min-width:0 nos Cards NÃO resolve; os SVGs dos charts
    // ficam com largura idêntica antes/depois. Mantido aqui também pra
    // rodar no runner real da CI em 375px — mesmo teste, sem tocar aside.
    function testarMinWidthZero(el: Element | null) {
      if (!el) return null;
      const he = el as HTMLElement;
      const antes = document.documentElement.scrollWidth;
      const originalMinWidth = he.style.minWidth;
      he.style.minWidth = "0px";
      const depois = document.documentElement.scrollWidth;
      he.style.minWidth = originalMinWidth;
      return { antes, depois, resolveu: depois <= limiar };
    }
    const testeMinWidthZeroPorCard = cards.map((card, i) => ({
      indice: i,
      ...testarMinWidthZero(card),
    }));
    let testeMinWidthZeroTodosCards = null;
    {
      const originais = cards.map((c) => (c as HTMLElement).style.minWidth);
      const antes = document.documentElement.scrollWidth;
      cards.forEach((c) => {
        (c as HTMLElement).style.minWidth = "0px";
      });
      const depois = document.documentElement.scrollWidth;
      cards.forEach((c, i) => {
        (c as HTMLElement).style.minWidth = originais[i];
      });
      testeMinWidthZeroTodosCards = { antes, depois, resolveu: depois <= limiar };
    }

    // Teste direto do h1 (achado local em 360px: hidden sozinho resolveu
    // 373->360, mesmo sem overflow visual em nenhum elemento — pode ser
    // artefato específico de 360px, ou pode reaparecer em 375 no Linux).
    function medirEstadoGlobal() {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth,
        scrollbarWidthProxy: window.innerWidth - document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      };
    }
    function medirSvgsRecharts() {
      return svgsRecharts.map((svg) => {
        const r = svg.getBoundingClientRect();
        return { width: Math.round(r.width), right: Math.round(r.right), viewBox: svg.getAttribute("viewBox") };
      });
    }
    const h1El = document.querySelector("main h1");
    const estadoComH1 = medirEstadoGlobal();
    const svgsComH1 = medirSvgsRecharts();
    let estadoSemH1 = null;
    let svgsSemH1 = null;
    if (h1El) {
      const he = h1El as HTMLElement;
      const originalDisplay = he.style.display;
      he.style.display = "none";
      estadoSemH1 = medirEstadoGlobal();
      svgsSemH1 = medirSvgsRecharts();
      he.style.display = originalDisplay;
    }
    const testeH1Direto = { estadoComH1, estadoSemH1, svgsComH1, svgsSemH1 };

    // Item 21: experimental — flex-wrap no filter-row (só diagnóstico).
    let testeFlexWrap = null;
    if (filterRow) {
      const he = filterRow as HTMLElement;
      const originalWrap = he.style.flexWrap;
      he.style.flexWrap = "wrap";
      const sw = document.documentElement.scrollWidth;
      he.style.flexWrap = originalWrap;
      testeFlexWrap = { scrollWidthComWrap: sw, resolveu: sw <= limiar };
    }

    // Item 23: experimental — overflow-x:hidden em main (só diagnóstico,
    // NÃO é fix recomendado, só localização).
    let testeMainOverflowHidden = null;
    if (mainEl) {
      const originalOverflow = mainEl.style.overflowX;
      mainEl.style.overflowX = "hidden";
      const sw = document.documentElement.scrollWidth;
      mainEl.style.overflowX = originalOverflow;
      testeMainOverflowHidden = { scrollWidthComOverflowHidden: sw, resolveu: sw <= limiar };
    }
    // ================= fim reabertura =================

    const resultadoIsolamento = resultadoIsolamentoTocandoAside;

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
      estabilidadeReflowSemOcultar,
      demoVisibilityVsDisplay,
      haOverflowReal,
      resultadoIsolamento,
      cadeiaDoCausador,
      pseudoDoCausadorEAncestrais,
      scrollWidthPosRestauracao,
      // ---- reabertura (busca sem tocar aside) ----
      medidaMain,
      medidaContentWrapper,
      candidatosSemClipping,
      resultadoIsolamentoMain,
      trilhaMain,
      testeChartsGrid,
      chartsGridComputed,
      testesPorCard,
      cardHeadersComputed,
      testeFilterRow,
      testeYAxis,
      testeSvgComposicaoInteiro,
      testeResponsiveContainerComposicao,
      testeMinWidthZeroPorCard,
      testeMinWidthZeroTodosCards,
      testeH1Direto,
      testeFlexWrap,
      testeMainOverflowHidden,
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

  // Item 24: comparação em 360px — fora da asserção real (já rodou acima,
  // intacta, em 375px). Só verifica se o MESMO elemento/subtree é o
  // responsável no viewport onde já se sabia haver overflow real (+13px,
  // Recharts/filter-row). Viewport restaurado pra 375 antes de continuar.
  await page.setViewportSize({ width: 360, height: 800 });
  const diagnostico360 = await page.evaluate(() => {
    function descreve(el: Element | null) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: (el.getAttribute("class") ?? "").slice(0, 140),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
      };
    }
    function medirOcultando(el: HTMLElement) {
      const originalDisplay = el.style.display;
      el.style.display = "none";
      const sw = document.documentElement.scrollWidth;
      el.style.display = originalDisplay;
      return sw;
    }
    const innerWidth = window.innerWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const limiar = innerWidth + 1;
    const haOverflowReal = scrollWidth > limiar;

    // Hipótese: ResponsiveContainer do Recharts usa ResizeObserver, que
    // reage de forma assíncrona a QUALQUER reflow — não só ao elemento
    // realmente ocultado. Se scrollWidth cair sozinho, sem ocultar nada
    // relevante, isso explica por que a busca por ocultação atribui
    // causa a elementos diferentes (aside, depois h1) entre execuções:
    // o "sucesso" coincide com o chart já ter se estabilizado numa
    // largura menor, não com o elemento testado naquele momento.
    const estabilidadeReflowSemOcultar: number[] = [];
    for (let i = 0; i < 8; i++) {
      void document.body.offsetHeight;
      estabilidadeReflowSemOcultar.push(document.documentElement.scrollWidth);
    }

    function isolarDentroDeMain(
      el: HTMLElement,
      profundidade: number
    ): { encontrado: boolean; elemento?: ReturnType<typeof descreve>; profundidade?: number; scrollWidthSemEle?: number } {
      if (profundidade > 12) return { encontrado: false };
      const filhos = Array.from(el.children) as HTMLElement[];
      for (const filho of filhos) {
        const sw = medirOcultando(filho);
        if (sw <= limiar) {
          const sub = isolarDentroDeMain(filho, profundidade + 1);
          if (sub.encontrado) return sub;
          return { encontrado: true, elemento: descreve(filho), profundidade, scrollWidthSemEle: sw };
        }
      }
      return { encontrado: false };
    }

    const mainEl = document.querySelector("main");
    const resultado = haOverflowReal && mainEl ? isolarDentroDeMain(mainEl, 0) : { encontrado: false };

    // Achado local: os SVGs dos charts NÃO mudam de largura ao ocultar o
    // h1 (ver testeH1Direto abaixo), então a busca por ocultação estava
    // atribuindo causa errada. Aqui: geometria direta — quem realmente
    // ultrapassa o viewport, sem ancestor com overflow:hidden antes do
    // body (mesma lógica de candidatosSemClipping do bloco 375px).
    function temClippingAteBody(el: Element): boolean {
      let atual = el.parentElement;
      while (atual && atual !== document.body) {
        const cs = getComputedStyle(atual);
        if (
          cs.overflow === "hidden" ||
          cs.overflowX === "hidden" ||
          cs.overflow === "clip" ||
          cs.overflowX === "clip"
        ) {
          return true;
        }
        atual = atual.parentElement;
      }
      return false;
    }
    function candidatosReaisNaFaixa() {
      const vw = window.innerWidth;
      const out: ReturnType<typeof descreve>[] = [];
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && !temClippingAteBody(el)) {
          out.push(descreve(el));
        }
      });
      return out.slice(0, 30);
    }
    const candidatosSemClipping = haOverflowReal ? candidatosReaisNaFaixa() : [];

    // Hipótese (dado que candidatosSemClipping vem vazio — nenhum
    // elemento tem rect.right além do viewport, então não é overflow
    // "visual"/de pintura): Card é item de grid (grid-cols-1 do
    // Tailwind já usa minmax(0,1fr) na TRACK, mas isso não afeta o
    // min-width:auto padrão do ITEM em si) — mesmo mecanismo já
    // corrigido no aside/content-wrapper, agora no Card, não capturado
    // por getBoundingClientRect porque o Card tem overflow-hidden (clip
    // de pintura), mas o motor de layout pode calcular a largura mínima
    // automática do item a partir do min-content do YAxis de largura
    // fixa ANTES do clip. Teste direto: min-width:0 nos Cards resolve?
    function testarMinWidthZero(el: Element | null) {
      if (!el) return null;
      const he = el as HTMLElement;
      const antes = document.documentElement.scrollWidth;
      const originalMinWidth = he.style.minWidth;
      he.style.minWidth = "0px";
      const depois = document.documentElement.scrollWidth;
      he.style.minWidth = originalMinWidth;
      return { antes, depois, resolveu: depois <= limiar };
    }
    const cardsChartsGrid360 = Array.from(document.querySelectorAll('main [data-slot="card"]'));
    const testeMinWidthZeroPorCard = cardsChartsGrid360.map((card, i) => ({
      indice: i,
      ...testarMinWidthZero(card),
    }));
    let testeMinWidthZeroTodosCards = null;
    {
      const originais = cardsChartsGrid360.map((c) => (c as HTMLElement).style.minWidth);
      const antes = document.documentElement.scrollWidth;
      cardsChartsGrid360.forEach((c) => {
        (c as HTMLElement).style.minWidth = "0px";
      });
      const depois = document.documentElement.scrollWidth;
      cardsChartsGrid360.forEach((c, i) => {
        (c as HTMLElement).style.minWidth = originais[i];
      });
      testeMinWidthZeroTodosCards = { antes, depois, resolveu: depois <= limiar };
    }

    function testarOcultacao(el: Element | null) {
      if (!el) return null;
      const he = el as HTMLElement;
      const antes = document.documentElement.scrollWidth;
      const originalDisplay = he.style.display;
      he.style.display = "none";
      const depois = document.documentElement.scrollWidth;
      he.style.display = originalDisplay;
      return { antes, depois, resolveu: depois <= limiar };
    }
    const botaoStatus = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Status"
    );
    const filterRow = botaoStatus?.parentElement ?? null;
    const testeFilterRow = testarOcultacao(filterRow);
    const svgsRecharts = Array.from(document.querySelectorAll(".recharts-wrapper > svg.recharts-surface"));
    const svgComposicao = svgsRecharts[1] ?? null;
    const yAxisComposicao = svgComposicao?.querySelector(".recharts-yAxis") ?? null;
    const testeYAxis = testarOcultacao(yAxisComposicao);

    // Confirma (ou refuta) diretamente, fora da busca recursiva, se
    // ocultar SÓ o <h1> reproduz 373->360 — e verifica se uma
    // scrollbar vertical (clientWidth < innerWidth) aparece/some junto,
    // já que h1 fica em fluxo normal (bloco) com os outros irmãos, sem
    // razão óbvia pra afetar largura horizontal de conteúdo mais abaixo.
    function medirEstado() {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth,
        scrollbarWidthProxy: window.innerWidth - document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      };
    }
    function medirSvgs() {
      return svgsRecharts.map((svg) => {
        const r = svg.getBoundingClientRect();
        return { width: Math.round(r.width), right: Math.round(r.right), viewBox: svg.getAttribute("viewBox") };
      });
    }
    const h1El = document.querySelector("main h1");
    const estadoComH1 = medirEstado();
    const svgsComH1 = medirSvgs();
    let estadoSemH1 = null;
    let svgsSemH1 = null;
    if (h1El) {
      const he = h1El as HTMLElement;
      const originalDisplay = he.style.display;
      he.style.display = "none";
      estadoSemH1 = medirEstado();
      svgsSemH1 = medirSvgs();
      he.style.display = originalDisplay;
    }

    return {
      innerWidth,
      scrollWidth,
      haOverflowReal,
      estabilidadeReflowSemOcultar,
      resultado,
      candidatosSemClipping,
      testeMinWidthZeroPorCard,
      testeMinWidthZeroTodosCards,
      testeFilterRow,
      testeYAxis,
      testeH1Direto: { estadoComH1, estadoSemH1, svgsComH1, svgsSemH1 },
      scrollWidthPosRestauracao: document.documentElement.scrollWidth,
    };
  });
  console.log("MOBILE_OVERFLOW_DIAGNOSTIC_360:" + JSON.stringify(diagnostico360));
  await page.setViewportSize({ width: 375, height: 667 });

  await page.getByRole("link", { name: "Imóveis" }).click();
  await page.waitForURL("/app/imoveis");
  await expect(page.getByRole("heading", { name: "Imóveis" })).toBeVisible();
});

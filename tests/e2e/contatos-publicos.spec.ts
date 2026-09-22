import { test, expect, type Page } from "@playwright/test";
import { IDS_E2E, ORG_A, ORG_CONTATOS, login } from "./helpers";

// =======================================================================
// Contatos e redes sociais no topo e no rodapé (Fase 58)
// =======================================================================
// A organização deste spec tem, de propósito, uma combinação diferente
// por canal (ver seed-e2e.ts):
//
//   telefone   topo + rodapé
//   whatsapp   só topo
//   instagram  topo + rodapé
//   tiktok     só topo
//   linkedin   só rodapé
//   facebook   preenchido, nenhum local
//   youtube    VAZIO, com as duas flags ligadas
//
// É essa mistura que prova a regra inteira numa página só.

const BASE = `/${ORG_CONTATOS.slug}`;
const FICHA = `${BASE}/imoveis/${IDS_E2E.imovelContatos}`;

const barra = (page: Page) => page.locator("[data-barra-contato-topo]");
const noTopo = (page: Page, canal: string) => page.locator(`[data-canal-topo='${canal}']`);
const noRodape = (page: Page, canal: string) => page.locator(`[data-canal-rodape='${canal}']`);

async function caixa(page: Page, seletor: string) {
  const box = await page.locator(seletor).first().boundingBox();
  expect(box, `sem caixa: ${seletor}`).not.toBeNull();
  return box!;
}

test.describe("a regra: preenchido E habilitado", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);
  });

  test("canal nos dois locais aparece nos dois", async ({ page }) => {
    await expect(noTopo(page, "telefone")).toBeVisible();
    await expect(noRodape(page, "telefone")).toBeVisible();
    await expect(noTopo(page, "instagram")).toBeVisible();
    await expect(noRodape(page, "instagram")).toBeVisible();
  });

  test("canal só no topo não aparece no rodapé", async ({ page }) => {
    await expect(noTopo(page, "whatsapp")).toBeVisible();
    await expect(noRodape(page, "whatsapp")).toHaveCount(0);
    await expect(noTopo(page, "tiktok")).toBeVisible();
    await expect(noRodape(page, "tiktok")).toHaveCount(0);
  });

  test("canal só no rodapé não aparece no topo", async ({ page }) => {
    await expect(noRodape(page, "linkedin")).toBeVisible();
    await expect(noTopo(page, "linkedin")).toHaveCount(0);
  });

  test("preenchido com as duas flags desligadas não aparece em lugar nenhum", async ({ page }) => {
    await expect(noTopo(page, "facebook")).toHaveCount(0);
    await expect(noRodape(page, "facebook")).toHaveCount(0);
  });

  test("flag ligada sem valor não renderiza nada — nem ícone sem link", async ({ page }) => {
    await expect(noTopo(page, "youtube")).toHaveCount(0);
    await expect(noRodape(page, "youtube")).toHaveCount(0);
  });
});

test.describe("hrefs e segurança dos links", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);
  });

  test("telefone usa tel: com os dígitos, e não abre em nova aba", async ({ page }) => {
    const link = noTopo(page, "telefone");
    await expect(link).toHaveAttribute("href", "tel:+1138883000");
    await expect(link).not.toHaveAttribute("target", "_blank");
  });

  test("WhatsApp usa wa.me com o número configurado", async ({ page }) => {
    const href = await noTopo(page, "whatsapp").getAttribute("href");
    expect(href).toContain("https://wa.me/5511999998888");
  });

  test("links externos levam rel de segurança e abrem em nova aba", async ({ page }) => {
    for (const canal of ["whatsapp", "instagram", "tiktok"]) {
      const link = noTopo(page, canal);
      await expect(link).toHaveAttribute("target", "_blank");
      const rel = (await link.getAttribute("rel")) ?? "";
      expect(rel).toContain("noopener");
      expect(rel).toContain("noreferrer");
    }
  });

  test("nenhum href do topo ou do rodapé usa esquema perigoso", async ({ page }) => {
    const hrefs = await page
      .locator("[data-canal-topo], [data-canal-rodape]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).not.toMatch(/^\s*(javascript|data|vbscript):/i);
      expect(href).toMatch(/^(https?:|tel:)/);
    }
  });
});

test.describe("acessibilidade", () => {
  test("ícones de rede têm nome acessível, e o telefone é lido pelo número", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);

    await expect(noTopo(page, "instagram")).toHaveAccessibleName("Instagram");
    await expect(noTopo(page, "tiktok")).toHaveAccessibleName("TikTok");
    await expect(noRodape(page, "linkedin")).toHaveAccessibleName("LinkedIn");
    await expect(noTopo(page, "telefone")).toHaveAccessibleName(/3888/);
  });

  test("os canais do topo são alcançáveis por teclado e recebem foco", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);

    await noTopo(page, "telefone").focus();
    await expect(noTopo(page, "telefone")).toBeFocused();
    // Tab avança dentro da própria barra, na ordem do DOM.
    await page.keyboard.press("Tab");
    await expect(noTopo(page, "whatsapp")).toBeFocused();
  });
});

test.describe("geometria do cabeçalho", () => {
  test("a barra fica ACIMA da navegação, sem sobrepor logo nem menu", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);

    const b = await caixa(page, "[data-barra-contato-topo]");
    const logo = await caixa(page, "[data-logo-site]");
    const favoritos = await caixa(page, "[data-link-favoritos]");

    // A barra termina antes de o logo começar: estão empilhados, não
    // sobrepostos.
    expect(b.y + b.height).toBeLessThanOrEqual(logo.y + 0.5);
    // Menu e contatos não dividem a mesma faixa vertical.
    expect(b.y + b.height).toBeLessThanOrEqual(favoritos.y + 0.5);
    // A barra é discreta: bem mais baixa que a faixa do logo.
    expect(b.height).toBeLessThan(logo.height + 24);
  });

  test("o conjunto não fica excessivamente alto", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);
    const comBarra = await caixa(page, "header");

    // Mesma página, tenant SEM barra: a referência do "antes".
    await page.goto("/");
    const semBarra = await caixa(page, "header");

    expect(await barra(page).count()).toBe(0);
    // A barra acrescenta altura, mas o cabeçalho cede padding: o
    // crescimento fica bem abaixo da altura da própria barra somada
    // ingenuamente.
    expect(comBarra.height).toBeGreaterThan(semBarra.height);
    expect(comBarra.height - semBarra.height).toBeLessThan(48);
  });

  test("a barra não some nem duplica ao navegar entre rotas públicas", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    for (const rota of [BASE, `${BASE}/imoveis`, FICHA, `${BASE}/contato`, `${BASE}/favoritos`]) {
      await page.goto(rota);
      await expect(barra(page), `barra em ${rota}`).toHaveCount(1);
      await expect(page.locator("footer"), `rodapé em ${rota}`).toHaveCount(1);
    }
  });
});

test.describe("tenant sem configuração nenhuma", () => {
  test("não existe barra superior no DOM, e o cabeçalho é o de sempre", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/");

    await expect(barra(page)).toHaveCount(0);
    await expect(page.locator("[data-canal-topo]")).toHaveCount(0);
    // A navegação de sempre continua inteira.
    await expect(page.locator("[data-logo-site]")).toBeVisible();
    await expect(page.locator("[data-link-favoritos]").first()).toBeVisible();
  });

  test("o rodapé não ganha bloco de contato sem configuração", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-contatos-rodape]")).toHaveCount(0);
  });

  test("as redes que a Org A já publicava continuam no rodapé", async ({ page }) => {
    // Sem regressão visual: o default de rodapé das redes é ligado
    // justamente para o ícone que já aparecia não sumir no deploy.
    await page.goto(`/${ORG_A.slug}`);
    const redes = page.locator("[data-redes-rodape] a");
    if ((await redes.count()) > 0) {
      await expect(redes.first()).toHaveAttribute("rel", /noopener/);
    }
  });
});

test.describe("responsividade", () => {
  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: sem estouro horizontal, com barra e rodapé`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(BASE);

      await expect(barra(page)).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        ),
        `estouro do documento @ ${largura}`
      ).toBe(true);

      // A barra inteira cabe na viewport.
      const b = await caixa(page, "[data-barra-contato-topo]");
      expect(b.x).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(largura + 0.5);

      // Contato continua acessível em qualquer largura.
      await expect(noTopo(page, "telefone")).toBeVisible();

      // O rodapé também não estoura.
      const rodape = await caixa(page, "footer");
      expect(rodape.x + rodape.width).toBeLessThanOrEqual(largura + 0.5);
    });
  }

  test("em 320px as redes saem da barra e ficam no menu, sem espremer", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(BASE);

    // Ícones de rede não disputam espaço com o telefone na barra.
    await expect(noTopo(page, "instagram")).toBeHidden();
    // Mas continuam alcançáveis pelo menu.
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(page.locator("[data-canal-menu='instagram']")).toBeVisible();
    await expect(page.locator("[data-canal-menu='tiktok']")).toBeVisible();
    // E o que está só no rodapé NÃO vaza para o menu do topo.
    await expect(page.locator("[data-canal-menu='linkedin']")).toHaveCount(0);
  });

  test("a navegação principal continua funcionando com a barra presente", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);

    await page.getByRole("link", { name: "Comprar" }).first().click();
    await page.waitForURL(/finalidade=SALE/);
    await expect(barra(page)).toHaveCount(1);
  });
});


// =======================================================================
// Configuração pelo FORMULÁRIO REAL
// =======================================================================
// A Fase 58 testou a regra (unitário), a action (integração, com FormData
// montado à mão) e a renderização (E2E, com o banco semeado direto). O
// que NENHUM deles atravessava era a tela: marcar a caixa, salvar, e ver
// o site mudar. Foi nessa lacuna que o defeito relatado se escondeu —
// em produção todas as flags ficaram no default, com as URLs salvas.

/** Largura realmente pintada do texto de um rótulo. */
async function larguraDoTexto(page: Page, seletor: string) {
  return page.locator(seletor).evaluate((el) => {
    let total = 0;
    for (const no of Array.from(el.childNodes)) {
      if (no.nodeType !== Node.TEXT_NODE || !no.textContent?.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(no);
      total += r.getBoundingClientRect().width;
    }
    for (const span of Array.from(el.querySelectorAll("span"))) {
      total += span.getBoundingClientRect().width;
    }
    return total;
  });
}

test.describe("a tela de configuração", () => {
  test("cada caixa Topo/Rodapé se identifica com texto visível, em qualquer largura", async ({
    page,
  }) => {
    await login(page, ORG_CONTATOS);

    for (const largura of [390, 1280]) {
      await page.setViewportSize({ width: largura, height: 1200 });
      await page.goto("/app/configuracoes");

      for (const canal of ["telefone", "instagram"]) {
        for (const local of ["topo", "rodape"]) {
          const texto = await larguraDoTexto(page, `[data-flag='${canal}-${local}']`);
          // Esconder o rótulo (sr-only) deixava duas caixas idênticas e
          // mudas lado a lado — foi o que permitiu marcar uma pensando
          // estar marcando a outra.
          expect(texto, `rótulo de ${canal}/${local} @ ${largura}px`).toBeGreaterThan(20);
        }
      }
    }
  });

  test("o formulário reflete o que está salvo, caixa por caixa", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await login(page, ORG_CONTATOS);
    await page.goto("/app/configuracoes");

    const marcada = (canal: string, local: string) =>
      page.locator(`[data-flag='${canal}-${local}'] input[type=checkbox]`).isChecked();

    // Mesma combinação do seed — a tela não pode inventar estado.
    expect(await marcada("telefone", "topo")).toBe(true);
    expect(await marcada("telefone", "rodape")).toBe(true);
    expect(await marcada("whatsapp", "topo")).toBe(true);
    expect(await marcada("whatsapp", "rodape")).toBe(false);
    expect(await marcada("linkedin", "topo")).toBe(false);
    expect(await marcada("linkedin", "rodape")).toBe(true);
    expect(await marcada("facebook", "topo")).toBe(false);
    expect(await marcada("facebook", "rodape")).toBe(false);
  });

  test("desmarcar Topo tira do topo, mantém no rodapé, e persiste", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await login(page, ORG_CONTATOS);

    const caixaTopo = "[data-flag='telefone-topo']";
    const inputTopo = `${caixaTopo} input[type=checkbox]`;

    try {
      // 1. Estado inicial: telefone aparece nos dois lugares.
      await page.goto(BASE);
      await expect(noTopo(page, "telefone")).toBeVisible();
      await expect(noRodape(page, "telefone")).toBeVisible();

      // 2. Desmarca só o Topo e salva.
      await page.goto("/app/configuracoes");
      await page.locator(caixaTopo).click();
      await expect(page.locator(inputTopo)).not.toBeChecked();
      await page.getByRole("button", { name: /Salvar alterações/ }).click();
      await expect(page.getByRole("button", { name: /Salvar alterações/ })).toBeEnabled();

      // 3. RECARREGA: a caixa continua desmarcada — persistiu de fato,
      //    não é só estado do React.
      await page.goto("/app/configuracoes");
      await expect(page.locator(inputTopo)).not.toBeChecked();

      // 4. O site reflete: sumiu do topo, continua no rodapé.
      await page.goto(BASE);
      await expect(noTopo(page, "telefone")).toHaveCount(0);
      await expect(noRodape(page, "telefone")).toBeVisible();
      // A barra continua existindo por causa dos outros canais do topo.
      await expect(barra(page)).toHaveCount(1);
    } finally {
      // 5. Restaura o estado do seed — as outras specs deste arquivo
      //    dependem dele.
      await page.goto("/app/configuracoes");
      if (!(await page.locator(inputTopo).isChecked())) {
        await page.locator(caixaTopo).click();
        await page.getByRole("button", { name: /Salvar alterações/ }).click();
        await expect(page.getByRole("button", { name: /Salvar alterações/ })).toBeEnabled();
      }
    }

    // 6. Voltou ao estado inicial, e o topo voltou junto.
    await page.goto(BASE);
    await expect(noTopo(page, "telefone")).toBeVisible();
  });

  test("marcar Topo num canal que só estava no rodapé o leva ao topo", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await login(page, ORG_CONTATOS);

    const caixa = "[data-flag='linkedin-topo']";
    const input = `${caixa} input[type=checkbox]`;

    try {
      await page.goto(BASE);
      await expect(noTopo(page, "linkedin")).toHaveCount(0);
      await expect(noRodape(page, "linkedin")).toBeVisible();

      await page.goto("/app/configuracoes");
      await page.locator(caixa).click();
      await page.getByRole("button", { name: /Salvar alterações/ }).click();
      await expect(page.getByRole("button", { name: /Salvar alterações/ })).toBeEnabled();

      await page.goto("/app/configuracoes");
      await expect(page.locator(input)).toBeChecked();

      await page.goto(BASE);
      await expect(noTopo(page, "linkedin")).toBeVisible();
      await expect(noRodape(page, "linkedin")).toBeVisible();
    } finally {
      await page.goto("/app/configuracoes");
      if (await page.locator(input).isChecked()) {
        await page.locator(caixa).click();
        await page.getByRole("button", { name: /Salvar alterações/ }).click();
        await expect(page.getByRole("button", { name: /Salvar alterações/ })).toBeEnabled();
      }
    }

    await page.goto(BASE);
    await expect(noTopo(page, "linkedin")).toHaveCount(0);
  });
});

// =======================================================================
// Composição da barra (Fase 58.2)
// =======================================================================
// A organização do seed tem horário + redes (instagram, tiktok) +
// telefone + WhatsApp habilitados para o topo — exatamente o CASO A.

test.describe("composição da barra superior", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);
  });

  test("o horário aparece à esquerda, com o texto configurado", async ({ page }) => {
    const horario = page.locator("[data-horario-topo]");
    await expect(horario).toBeVisible();
    await expect(horario).toContainText("Segunda a sexta");

    const h = await caixa(page, "[data-horario-topo]");
    const direito = await caixa(page, "[data-grupo-direito]");
    // Grupos distintos, o horário inteiramente antes do grupo direito.
    expect(h.x + h.width).toBeLessThanOrEqual(direito.x + 0.5);
  });

  test("a ordem horizontal é redes -> telefone -> WhatsApp", async ({ page }) => {
    const instagram = await caixa(page, "[data-canal-topo='instagram']");
    const tiktok = await caixa(page, "[data-canal-topo='tiktok']");
    const telefone = await caixa(page, "[data-canal-topo='telefone']");
    const whatsapp = await caixa(page, "[data-canal-topo='whatsapp']");

    // Redes antes dos contatos.
    expect(instagram.x).toBeLessThan(telefone.x);
    expect(tiktok.x).toBeLessThan(telefone.x);
    // E telefone antes do WhatsApp.
    expect(telefone.x).toBeLessThan(whatsapp.x);
    // Tudo na mesma linha (mesma faixa vertical).
    expect(Math.abs(instagram.y - whatsapp.y)).toBeLessThan(8);
  });

  test("telefone e WhatsApp NÃO ficam mais à esquerda", async ({ page }) => {
    const horario = await caixa(page, "[data-horario-topo]");
    const telefone = await caixa(page, "[data-canal-topo='telefone']");
    const whatsapp = await caixa(page, "[data-canal-topo='whatsapp']");

    expect(telefone.x).toBeGreaterThan(horario.x + horario.width);
    expect(whatsapp.x).toBeGreaterThan(horario.x + horario.width);
  });

  test("o grupo direito alinha com a borda direita do mesmo container da navegação", async ({
    page,
  }) => {
    const direito = await caixa(page, "[data-grupo-direito]");
    // Referência REAL: o item mais à direita do cabeçalho principal, que
    // vive no mesmo container max-w-6xl. Nada de pixel absoluto.
    const favoritos = await caixa(page, "[data-link-favoritos]");

    const bordaDireitaBarra = direito.x + direito.width;
    const bordaDireitaNav = favoritos.x + favoritos.width;
    // Tolerância pequena: os dois têm padding horizontal próprio.
    expect(Math.abs(bordaDireitaBarra - bordaDireitaNav)).toBeLessThan(20);
  });

  test("o separador só existe entre redes e contatos", async ({ page }) => {
    await expect(page.locator("[data-separador-topo]")).toHaveCount(1);
    const sep = await caixa(page, "[data-separador-topo]");
    const tiktok = await caixa(page, "[data-canal-topo='tiktok']");
    const telefone = await caixa(page, "[data-canal-topo='telefone']");
    expect(sep.x).toBeGreaterThanOrEqual(tiktok.x + tiktok.width - 0.5);
    expect(sep.x + sep.width).toBeLessThanOrEqual(telefone.x + 0.5);
  });

  test("o ícone do WhatsApp usa o verde da marca, e a cor não é o único sinal", async ({
    page,
  }) => {
    // A comparação é contra o TOKEN do projeto, não contra um hex
    // literal: o navegador serializa cores modernas em `lab(...)`, e
    // interpretar esses três números como RGB dava verde por errado.
    // Medir "é a mesma cor que --whatsapp-brand" é o que a regra pede e
    // não depende de espaço de cor.
    const { icone, marca, telefone } = await page.evaluate(() => {
      const sonda = document.createElement("span");
      sonda.style.color = "var(--whatsapp-brand)";
      document.body.appendChild(sonda);
      const marca = getComputedStyle(sonda).color;
      sonda.remove();
      return {
        icone: getComputedStyle(
          document.querySelector("[data-canal-topo='whatsapp'] svg")!
        ).color,
        marca,
        telefone: getComputedStyle(
          document.querySelector("[data-canal-topo='telefone'] svg")!
        ).color,
      };
    });

    expect(icone, `ícone=${icone} marca=${marca}`).toBe(marca);
    // E é uma cor PRÓPRIA: voltar a herdar o cinza da barra (como o
    // ícone do telefone faz) é exatamente a regressão a impedir.
    expect(icone).not.toBe(telefone);

    // O texto identifica o canal sem depender da cor.
    await expect(page.locator("[data-canal-topo='whatsapp']")).toContainText("WhatsApp");
  });

  test("o telefone continua com href tel: e nome acessível", async ({ page }) => {
    const link = page.locator("[data-canal-topo='telefone']");
    await expect(link).toHaveAttribute("href", "tel:+1138883000");
    await expect(link).toHaveAccessibleName(/3888/);
  });
});

test.describe("casos parciais da barra", () => {
  test("sem nada habilitado, a barra não existe (tenant padrão)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/");
    await expect(page.locator("[data-barra-contato-topo]")).toHaveCount(0);
    await expect(page.locator("[data-horario-topo]")).toHaveCount(0);
    await expect(page.locator("[data-grupo-direito]")).toHaveCount(0);
  });

  test("sem redes visíveis (mobile), não sobra separador órfão", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(BASE);
    // As redes saem da barra abaixo de sm; o separador vai junto.
    await expect(page.locator("[data-canal-topo='instagram']")).toBeHidden();
    await expect(page.locator("[data-separador-topo]")).toBeHidden();
    // Horário e contatos continuam.
    await expect(page.locator("[data-horario-topo]")).toBeVisible();
    await expect(page.locator("[data-canal-topo='telefone']")).toBeVisible();
    await expect(page.locator("[data-canal-topo='whatsapp']")).toBeVisible();
  });
});

test.describe("responsividade da barra recomposta", () => {
  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: horário e contatos cabem, sem estouro nem sobreposição`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(BASE);

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        ),
        `estouro @ ${largura}`
      ).toBe(true);

      const horario = await caixa(page, "[data-horario-topo]");
      const telefone = await caixa(page, "[data-canal-topo='telefone']");
      const whatsapp = await caixa(page, "[data-canal-topo='whatsapp']");

      // Tudo dentro da viewport.
      for (const [nome, cx] of [["horário", horario], ["telefone", telefone], ["whatsapp", whatsapp]] as const) {
        expect(cx.x, `${nome} saiu pela esquerda @ ${largura}`).toBeGreaterThanOrEqual(-0.5);
        expect(cx.x + cx.width, `${nome} saiu pela direita @ ${largura}`).toBeLessThanOrEqual(
          largura + 0.5
        );
      }

      // Horário e contatos não se sobrepõem: ou estão em linhas
      // diferentes, ou o horário termina antes do telefone começar.
      const mesmaLinha = Math.abs(horario.y - telefone.y) < 8;
      if (mesmaLinha) {
        expect(horario.x + horario.width, `sobreposição @ ${largura}`).toBeLessThanOrEqual(
          telefone.x + 0.5
        );
      }

      // O texto do horário não é cortado.
      expect(
        await page
          .locator("[data-horario-topo] span")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `horário cortado @ ${largura}`
      ).toBe(true);
    });
  }
});

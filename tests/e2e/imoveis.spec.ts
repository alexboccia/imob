import { test, expect } from "@playwright/test";
import { ORG_A, IDS_E2E, login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page, ORG_A);
});

// 3. criar imóvel
test("cria um imóvel com os campos mínimos obrigatórios", async ({ page }) => {
  await page.goto("/app/imoveis/novo");

  await page.locator("#titulo").fill("Apartamento E2E Novo");
  await page.locator('input[name="bairro"]').fill("Bairro Teste");
  await page.locator('input[name="cidade"]').fill("São Paulo");
  await page.locator('select[name="estado"]').selectOption("SP");

  await page.getByRole("button", { name: "Salvar imóvel" }).click();

  await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);
});

// 4. erro de validação no imóvel
test("mostra erro de validação quando o título é curto demais", async ({ page }) => {
  await page.goto("/app/imoveis/novo");

  // Passa pela validação HTML5 "required" (não está vazio) mas falha no
  // schema Zod (imovelSchema.titulo exige min(3)) — dispara o erro
  // server-side, não o nativo do navegador.
  await page.locator("#titulo").fill("ab");
  await page.locator('input[name="bairro"]').fill("Bairro Teste");
  await page.locator('input[name="cidade"]').fill("São Paulo");
  await page.locator('select[name="estado"]').selectOption("SP");

  await page.getByRole("button", { name: "Salvar imóvel" }).click();

  await expect(
    page.getByText("Informe um título com ao menos 3 caracteres.")
  ).toBeVisible();
  await expect(page).toHaveURL("/app/imoveis/novo");
});

// 5. editar imóvel
test("edita um imóvel existente", async ({ page }) => {
  await page.goto(`/app/imoveis/${IDS_E2E.imovelParaEditarOrgA}`);
  await expect(page.locator("#titulo")).toHaveValue("Apartamento E2E para edição");

  await page.locator("#titulo").fill("Apartamento E2E editado com sucesso");
  await page.getByRole("button", { name: "Salvar imóvel" }).click();

  await page.waitForURL(`/app/imoveis/${IDS_E2E.imovelParaEditarOrgA}?salvo=1`);
  await expect(page.locator("#titulo")).toHaveValue("Apartamento E2E editado com sucesso");
});

// Redesenho de Imóveis — roda em ORG_A, já seedada com
// e2e-imovel-badges-a (Lançamento+Destaque+Oportunidade+Slideshow,
// AVAILABLE, tipo "Apartamento", finalidade SALE) e
// e2e-imovel-editar-a (sem badges) — os únicos 2 imóveis fixos, nunca
// zerados entre rodadas (ver prisma/seed-e2e.ts).
test.describe("Imóveis", () => {
  test("KPIs renderizam com números não-negativos, e '+ Novo imóvel' aponta para o fluxo real", async ({
    page,
  }) => {
    await page.goto("/app/imoveis");

    for (const titulo of ["Total de imóveis", "Disponíveis", "Oportunidades", "Destaques"]) {
      await expect(page.locator("main p.text-sm.text-muted-foreground", { hasText: titulo }).first()).toBeVisible();
    }
    const valores = await page.locator("main p.text-2xl").allTextContents();
    for (const v of valores) {
      expect(Number(v), `valor "${v}" deveria ser um número >= 0`).toBeGreaterThanOrEqual(0);
    }
    // e2e-imovel-badges-a garante Oportunidades/Destaques >= 1, sempre.
    const oportunidadesCard = page.locator("main p.text-sm.text-muted-foreground", { hasText: "Oportunidades" }).locator("..");
    expect(Number(await oportunidadesCard.locator("p.text-2xl").textContent())).toBeGreaterThanOrEqual(1);

    // Preserva o fluxo real de criação já existente (novo/page.tsx) — não
    // uma segunda implementação. Base UI renderiza role="button" mesmo
    // quando o elemento composto (render={<Link/>}) é uma <a> de verdade —
    // por isso o role aqui é "button", não "link"; o href real continua
    // sendo verificado no DOM.
    await expect(page.getByRole("button", { name: "+ Novo imóvel" })).toHaveAttribute("href", "/app/imoveis/novo");
  });

  test("busca encontra o imóvel esperado; badges do imóvel com todos os rótulos aparecem", async ({ page }) => {
    await page.goto("/app/imoveis");

    await page.getByPlaceholder("Buscar por código, título, tipo, cidade ou bairro...").fill("Santo Amaro");
    await page.waitForTimeout(500); // debounce de 400ms do DataTable.

    const linha = page.getByRole("row", { name: /Santo Amaro/ });
    await expect(linha).toBeVisible();
    for (const rotulo of ["Lançamento", "Destaque", "Oportunidade", "Slideshow"]) {
      await expect(linha.getByText(rotulo, { exact: true })).toBeVisible();
    }
  });

  // Estado vazio — busca sem resultado mostra mensagem neutra, nunca um
  // erro, independente de quantos imóveis já existam de execuções
  // anteriores (o seed nunca limpa os imóveis dinâmicos criados por outros
  // specs até a PRÓXIMA rodada). Teste isolado (não encadeado depois de
  // outra busca na mesma página) — mesmo padrão de usuarios.spec.ts.
  test("estado vazio: busca sem resultado mostra mensagem neutra, sem erro", async ({ page }) => {
    await page.goto("/app/imoveis");
    await page.getByPlaceholder("Buscar por código, título, tipo, cidade ou bairro...").fill("Zzz Imóvel Que Nunca Existe Vazio");
    await page.waitForTimeout(500);
    // .first(): viewport padrão (desktop) renderiza a mensagem vazia tanto
    // na tabela (visível) quanto no bloco de cards mobile (oculto via
    // `md:hidden`, mas presente no DOM) — mesmo racional do `.last()` no
    // teste de 375px abaixo, só que aqui a cópia visível é a PRIMEIRA
    // (tabela vem antes dos cards em DataTable.tsx).
    await expect(page.getByText("Nenhum imóvel encontrado com esses filtros.").first()).toBeVisible();
  });

  test("filtros de Status, Tipo e Finalidade filtram a listagem; Limpar filtros restaura busca e filtros", async ({
    page,
  }) => {
    await page.goto("/app/imoveis");
    await page.getByPlaceholder("Buscar por código, título, tipo, cidade ou bairro...").fill("Santo Amaro");
    await page.waitForTimeout(500);
    await expect(page.getByRole("row", { name: /Santo Amaro/ })).toBeVisible();

    // Status: o imóvel é AVAILABLE — filtrar por SOLD some com ele.
    await page.getByLabel("Status").selectOption("SOLD");
    await expect(page.getByRole("row", { name: /Santo Amaro/ })).not.toBeVisible();
    await page.getByLabel("Status").selectOption("__todos__");
    await expect(page.getByRole("row", { name: /Santo Amaro/ })).toBeVisible();

    // Finalidade: o imóvel é SALE — filtrar por RENT some com ele.
    await page.getByLabel("Finalidade").selectOption("RENT");
    await expect(page.getByRole("row", { name: /Santo Amaro/ })).not.toBeVisible();
    await page.getByLabel("Finalidade").selectOption("__todos__");
    await expect(page.getByRole("row", { name: /Santo Amaro/ })).toBeVisible();

    // Tipo: "Apartamento" é o único tipo seedado pra ORG_A — deve manter o
    // imóvel visível (prova que o filtro usa a fonte real de tipos, não
    // uma lista fixa divergente).
    await page.getByLabel("Tipo").selectOption("Apartamento");
    await expect(page.getByRole("row", { name: /Santo Amaro/ })).toBeVisible();

    await expect(page.getByRole("button", { name: "Limpar filtros" })).toBeVisible();
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await expect(page.getByLabel("Tipo")).toHaveValue("__todos__");
    await expect(page.getByPlaceholder("Buscar por código, título, tipo, cidade ou bairro...")).toHaveValue("");
  });

  // Cria 2 imóveis via fluxo real (Zzz primeiro, Aaa depois — títulos
  // deliberadamente invertidos em relação à ordem de criação), isolados
  // por um marcador único na busca. Código é autoincrement (Zzz nasce com
  // código MENOR que Aaa, por ter sido criado antes) — prova que Código e
  // Título ordenam de forma realmente independente um do outro (mesmo
  // racional do teste equivalente em usuarios.spec.ts para Nome/E-mail).
  test("ordena por Código e por Título pela UI (cabeçalho da coluna Imóvel)", async ({ page }) => {
    const marcador = `Ordenacao${Date.now()}`;
    const imovelZ = { titulo: `Zzz Imovel Ultimo ${marcador}` };
    const imovelA = { titulo: `Aaa Imovel Primeiro ${marcador}` };

    await page.goto("/app/imoveis");
    for (const imovel of [imovelZ, imovelA]) {
      await page.goto("/app/imoveis/novo");
      await page.locator("#titulo").fill(imovel.titulo);
      await page.locator('input[name="bairro"]').fill("Bairro Teste");
      await page.locator('input[name="cidade"]').fill("São Paulo");
      await page.locator('select[name="estado"]').selectOption("SP");
      await page.getByRole("button", { name: "Salvar imóvel" }).click();
      await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);
    }

    await page.goto("/app/imoveis");
    await page.getByPlaceholder("Buscar por código, título, tipo, cidade ou bairro...").fill(marcador);
    await page.waitForURL(new RegExp(`search=${marcador}`));

    async function ordem() {
      const linhas = await page.locator("tbody tr").allTextContents();
      return linhas.map((l) => (l.includes(imovelZ.titulo) ? "Z" : l.includes(imovelA.titulo) ? "A" : "?"));
    }

    // "Título" ascendente: Aaa... (A) antes de Zzz... (Z).
    await page.getByRole("button", { name: /Ordenar por Título/ }).click();
    await page.waitForURL(/sort=title%3Aasc/);
    await expect.poll(ordem, { timeout: 10000 }).toEqual(["A", "Z"]);

    // "Título" de novo -> descendente.
    await page.getByRole("button", { name: /Ordenar por Título/ }).click();
    await page.waitForURL(/sort=title%3Adesc/);
    await expect.poll(ordem, { timeout: 10000 }).toEqual(["Z", "A"]);

    // "Código" ascendente: Z foi criado primeiro (código menor) -> Z antes
    // de A, provando que não é uma cópia disfarçada da ordenação de título.
    await page.getByRole("button", { name: /Ordenar por Código/ }).click();
    await page.waitForURL(/sort=code%3Aasc/);
    await expect.poll(ordem, { timeout: 10000 }).toEqual(["Z", "A"]);

    // "Código" de novo -> descendente.
    await page.getByRole("button", { name: /Ordenar por Código/ }).click();
    await page.waitForURL(/sort=code%3Adesc/);
    await expect.poll(ordem, { timeout: 10000 }).toEqual(["A", "Z"]);

    // Busca continua aplicada durante toda a navegação de sort.
    await expect(page.getByPlaceholder("Buscar por código, título, tipo, cidade ou bairro...")).toHaveValue(marcador);
  });

  test("filtro de status na URL sobrevive a um clique em 'Ordenar por Código'", async ({ page }) => {
    await page.goto("/app/imoveis?filters=" + encodeURIComponent(JSON.stringify({ status: "AVAILABLE" })));
    await page.getByRole("button", { name: /Ordenar por Código/ }).click();
    await page.waitForURL(/sort=code/);
    expect(page.url()).toContain(encodeURIComponent(JSON.stringify({ status: "AVAILABLE" })));
    await expect(page.getByLabel("Status")).toHaveValue("AVAILABLE");
  });

  // Finding histórico (scrollWidth 451 vs innerWidth 375) — causa raiz era
  // estrutural: uma tabela de 8 colunas não cabe em 375px sem rolar. A
  // correção estrutural é a própria arquitetura (tabela some, cards
  // aparecem abaixo de md), não overflow-x-hidden — por isso o teste
  // também prova que <table> está oculta e o card real (com o mesmo
  // conteúdo) está visível, não só que o documento não estoura.
  test("375px: sem overflow horizontal, tabela oculta e card mobile visível", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/app/imoveis");

    const medida375 = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      medida375.scrollWidth <= medida375.innerWidth + 1,
      `innerWidth=${medida375.innerWidth} scrollWidth=${medida375.scrollWidth} bodyScrollWidth=${medida375.bodyScrollWidth}`
    ).toBe(true);
    await expect(page.locator("table")).toBeHidden();
    // .last(): a tabela desktop (oculta via `hidden md:block`, mas ainda
    // presente no DOM) e o card mobile renderizam o MESMO título — o card
    // é o segundo no DOM (renderCard vem depois do wrapper da tabela em
    // DataTable.tsx), então .last() é sempre a cópia realmente visível.
    await expect(page.getByText("Apartamento com 2 quartos à venda, 58m² – Santo Amaro").last()).toBeVisible();
  });

  test("360px com filtros ativos e KPIs: sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/app/imoveis");

    // Achado da investigação do overflow real no runner Linux da CI: o
    // helper anterior só devolvia um boolean — uma falha real no CI não
    // deixava nenhum número pra diagnosticar. Agora cada assertion carrega
    // innerWidth/scrollWidth/bodyScrollWidth na própria mensagem de falha,
    // sem alterar a tolerância (`<= innerWidth + 1`, idêntica à anterior).
    async function medirOverflow() {
      const m = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      return { semOverflow: m.scrollWidth <= m.innerWidth + 1, ...m };
    }

    async function esperarSemOverflow(rotulo: string) {
      const m = await medirOverflow();
      expect(
        m.semOverflow,
        `${rotulo}: innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
      ).toBe(true);
    }

    await esperarSemOverflow("overflow sem filtro ativo");

    // Assertion estrutural complementar (não substitui a medição acima) —
    // prova que a proteção de largura dos badges (min-w-0 + whitespace-
    // normal + overflow-wrap:anywhere, ver BadgesImovel em columns.tsx)
    // está realmente aplicada no DOM renderizado, sem depender de nenhum
    // pixel mágico dependente de fonte. e2e-imovel-badges-a garante pelo
    // menos um badge real sempre presente. O texto continua íntegro
    // (sem corte) mesmo quebrando em 2 linhas nesta largura.
    const primeiroBadge = page.locator(".md\\:hidden span", { hasText: "Oportunidade" }).first();
    await expect(primeiroBadge).toBeVisible();
    await expect(primeiroBadge).toHaveCSS("overflow-wrap", "anywhere");
    await expect(primeiroBadge).toHaveCSS("white-space", "normal");
    await expect(primeiroBadge).toHaveText("Oportunidade");

    await page.getByLabel("Status").selectOption("AVAILABLE");
    await page.waitForTimeout(200);
    await expect(page.getByRole("button", { name: "Limpar filtros" })).toBeVisible();
    await esperarSemOverflow("overflow com filtro de status ativo");

    await page.getByLabel("Tipo").selectOption("Apartamento");
    await page.waitForTimeout(200);
    await esperarSemOverflow("overflow com status + tipo ativos");
  });

  // Redesenho visual dos filtros — Status/Tipo/Finalidade e a busca
  // ("Buscar imóveis", extraída de DataTable pra este card via
  // TableSearchInput/hideSearchBar) agora vivem dentro do MESMO card,
  // provado aqui via ancestor comum `[data-slot="card"]` — antes eram
  // dois blocos visuais separados (ImoveisFiltrosBar + o campo que
  // DataTable renderizava sozinho acima da tabela).
  test("Status, Tipo, Finalidade e busca ficam no mesmo card visual", async ({ page }) => {
    await page.goto("/app/imoveis");

    const card = page.locator('[data-slot="card"]').filter({ has: page.getByLabel("Status") });
    await expect(card.getByLabel("Status")).toBeVisible();
    await expect(card.getByLabel("Tipo")).toBeVisible();
    await expect(card.getByLabel("Finalidade")).toBeVisible();
    await expect(card.getByLabel("Buscar imóveis")).toBeVisible();
    await expect(
      card.getByPlaceholder("Buscar por código, título, tipo, cidade ou bairro...")
    ).toBeVisible();
  });

  for (const width of [768, 1440]) {
    test(`${width}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/imoveis");

      const m = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(
        m.scrollWidth <= m.innerWidth + 1,
        `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth}`
      ).toBe(true);

      // Inspeção visual real (não só scrollWidth): rótulos legíveis,
      // select/input não espremidos, busca ocupando a maior parte da
      // largura ao lado do rótulo "Buscar imóveis".
      const buscaBox = await page.getByLabel("Buscar imóveis").boundingBox();
      expect(buscaBox && buscaBox.width, `largura da busca: ${buscaBox?.width}`).toBeGreaterThan(150);
    });
  }

  // Adversarial: parsing defensivo de `filters` no client — mesmo
  // mecanismo/correção já usado em Usuários (Finding #3 daquela
  // auditoria), reproduzido aqui desde o início pros 3 filtros novos.
  test("filters adversarial (status/tipo/finalidade não-string na URL) cai em estado neutro, sem warning nem crash", async ({
    page,
  }) => {
    const avisos: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") avisos.push(msg.text());
    });

    const casos = [
      { status: ["AVAILABLE", "SOLD"] },
      { status: { $ne: null } },
      { tipo: 123 },
      { finalidade: [] },
      { tipo: {} },
      { tipo: "Tipo Que Não Existe" },
      { finalidade: "INVALID_PURPOSE" },
      { status: "INVALID_STATUS" },
    ];

    for (const filtro of casos) {
      const resp = await page.goto(`/app/imoveis?filters=${encodeURIComponent(JSON.stringify(filtro))}`);
      expect(resp?.status()).toBe(200);
      await expect(page.getByLabel("Status")).toHaveValue("__todos__");
      await expect(page.getByLabel("Tipo")).toHaveValue("__todos__");
      await expect(page.getByLabel("Finalidade")).toHaveValue("__todos__");
    }

    const avisosDeSelectValue = avisos.filter((a) => a.includes("value prop") || a.includes("scalar value"));
    expect(avisosDeSelectValue, JSON.stringify(avisos)).toEqual([]);
  });
});

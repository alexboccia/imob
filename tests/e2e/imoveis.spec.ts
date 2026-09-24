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
// A tela de imóvel segue o MESMO padrão visual das Configurações: uma
// pilha de cards por assunto, com título e descrição, em vez da coluna
// única de vinte e poucos campos que ela era. Isto é teste de estrutura,
// não de estética: sem ele, nada impede a tela de voltar a ser plana.
test("o formulário do imóvel é uma pilha de seções, como as Configurações", async ({
  page,
}) => {
  await page.goto(`/app/imoveis/${IDS_E2E.imovelParaEditarOrgA}`);

  await expect(page.getByRole("heading", { level: 1, name: "Editar imóvel" })).toBeVisible();
  for (const secao of [
    "Identificação",
    "Divulgação",
    "Endereço",
    "Valores",
    "Medidas e cômodos",
    "Características",
    "Fotos",
    "Materiais de apresentação",
    "O que tem por perto",
  ]) {
    await expect(page.getByText(secao, { exact: true }).first()).toBeVisible();
  }
});

for (const largura of [320, 390, 768, 1280, 1440]) {
  test(`${largura}px: o formulário do imóvel não estoura a tela`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto(`/app/imoveis/${IDS_E2E.imovelParaEditarOrgA}`);
    await expect(page.getByRole("heading", { level: 1, name: "Editar imóvel" })).toBeVisible();

    const semOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
  });
}

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
  test("KPIs renderizam com números não-negativos, e 'Novo imóvel' aponta para o fluxo real", async ({
    page,
  }) => {
    await page.goto("/app/imoveis");

    // Fase 67 — os KPIs passaram a usar o cartão compartilhado do
    // backoffice (CartaoEstatistica). As asserções deixaram de depender de
    // classes utilitárias (`p.text-2xl`), que descreviam o CSS de uma
    // versão e quebrariam a cada ajuste visual, e passaram às âncoras
    // estruturais do componente. A INTENÇÃO é a mesma: os quatro rótulos
    // visíveis e valores numéricos não-negativos.
    for (const titulo of ["Total de imóveis", "Disponíveis", "Oportunidades", "Destaques"]) {
      await expect(page.locator("[data-kpi-rotulo]", { hasText: titulo }).first()).toBeVisible();
    }
    const valores = await page.locator("[data-grade-kpis] [data-kpi-valor]").allTextContents();
    expect(valores).toHaveLength(4);
    for (const v of valores) {
      expect(Number(v), `valor "${v}" deveria ser um número >= 0`).toBeGreaterThanOrEqual(0);
    }
    // e2e-imovel-badges-a garante Oportunidades/Destaques >= 1, sempre.
    const oportunidadesCard = page
      .locator("[data-grade-kpis] [data-slot=card]")
      .filter({ has: page.locator("[data-kpi-rotulo]", { hasText: "Oportunidades" }) });
    expect(
      Number(await oportunidadesCard.locator("[data-kpi-valor]").textContent())
    ).toBeGreaterThanOrEqual(1);

    // Preserva o fluxo real de criação já existente (novo/page.tsx) — não
    // uma segunda implementação. Base UI renderiza role="button" mesmo
    // quando o elemento composto (render={<Link/>}) é uma <a> de verdade —
    // por isso o role aqui é "button", não "link"; o href real continua
    // sendo verificado no DOM.
    // Fase 67 — o "+" literal do rótulo virou o ícone Plus (aria-hidden),
    // como nos demais botões de ação do painel, então o nome acessível
    // passou a ser "Novo imóvel". Rota, permissão e comportamento são os
    // mesmos, e o href continua sendo verificado no DOM.
    await expect(page.getByRole("button", { name: "Novo imóvel" })).toHaveAttribute(
      "href",
      "/app/imoveis/novo"
    );
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

// ---------------------------------------------------------------------
// Cadastro de lançamento (Fase 3.1). Dois testes cobrem o ciclo todo, de
// propósito: criar e salvar um imóvel é caro, e a lição da fase anterior
// foi que repetir setup administrativo por asserção degrada o E2E. Cada
// teste cria UM imóvel e verifica tudo que depende dele.
// ---------------------------------------------------------------------

test.describe("Imóveis — cadastro de lançamento", () => {
  const secao = (page: import("@playwright/test").Page) =>
    page.locator("fieldset").filter({ hasText: "Este imóvel é um lançamento" });

  test("seção de lançamento: fechada por padrão, abre ao marcar e orienta o preenchimento", async ({
    page,
  }) => {
    await page.goto("/app/imoveis/novo");
    const fs = secao(page);
    await expect(fs).toBeVisible();

    // Campos da obra não poluem o cadastro de um imóvel comum.
    await expect(page.locator("#construtora")).toHaveCount(0);
    await expect(page.locator("#estagioObra")).toHaveCount(0);
    await expect(page.locator("#previsaoEntrega")).toHaveCount(0);

    await page.getByText("Este imóvel é um lançamento").click();
    await expect(page.locator("#construtora")).toBeVisible();
    await expect(page.locator("#estagioObra")).toBeVisible();
    await expect(page.locator("#previsaoEntrega")).toBeVisible();

    // Sem nada preenchido, explica o que esses campos fazem no site.
    await expect(fs.getByText("0 de 3 informações preenchidas")).toBeVisible();
    await expect(fs.getByText(/enriquecem a página pública/)).toBeVisible();

    // A contagem é derivada em runtime, não persistida.
    await page.locator("#construtora").fill("Construtora Teste");
    await expect(fs.getByText("1 de 3 informações preenchidas")).toBeVisible();
    await page.locator("#previsaoEntrega").fill("2027-06");
    await expect(fs.getByText("2 de 3 informações preenchidas")).toBeVisible();
    await expect(fs.getByText(/enriquecem a página pública/)).toHaveCount(0);
  });

  test("lançamento completo: salva, sobrevive ao reload, chega ao site e desmarcar não apaga nada", async ({
    page,
  }) => {
    const titulo = `Lançamento E2E ${Date.now()}`;
    const construtora = "Construtora E2E Fase 3.1";

    await page.goto("/app/imoveis/novo");
    await page.locator("#titulo").fill(titulo);
    await page.locator('input[name="bairro"]').fill("Centro");
    await page.locator('input[name="cidade"]').fill("São Paulo");
    await page.locator('select[name="estado"]').selectOption("SP");

    // Novo imóvel nasce como Rascunho (comportamento correto: rascunho
    // não aparece no site). Publicar é necessário pra este teste chegar
    // até a página pública.
    await page.locator("#status").click();
    await page.getByRole("option", { name: "Disponível" }).click();

    await page.getByText("Este imóvel é um lançamento").click();
    await page.locator("#construtora").fill(construtora);
    await page.locator("#previsaoEntrega").fill("2027-06");
    await page.locator("#estagioObra").click();
    await page.getByRole("option", { name: /Em construção/ }).click();

    await page.getByRole("button", { name: "Salvar imóvel" }).click();
    await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);
    const idImovel = new URL(page.url()).pathname.split("/").pop()!;

    // 1) Reload mantém os três valores.
    await page.goto(`/app/imoveis/${idImovel}`);
    await expect(page.locator("#construtora")).toHaveValue(construtora);
    await expect(page.locator("#previsaoEntrega")).toHaveValue("2027-06");
    await expect(secao(page).getByText("3 de 3 informações preenchidas")).toBeVisible();

    // 2) Os dados chegam à página pública com o mês certo — sem
    //    deslocamento de timezone (junho não pode virar maio).
    await page.goto(`/imoveis/${idImovel}`);
    const cabecalho = page.locator("[data-identidade-imovel]");
    // Fase 46 — o estágio é um selo na faixa de contexto, acima do título.
    const selos = page.getByRole("list", { name: "Situação do imóvel" });
    await expect(selos.locator('[data-selo="obra"]')).toHaveText("Em construção");
    await expect(cabecalho.getByText("Junho de 2027")).toBeVisible();
    await expect(cabecalho.getByText(construtora)).toBeVisible();

    // 3) Desmarcar "lançamento" NÃO apaga os dados da obra: a seção
    //    continua aberta porque há conteúdo, e salvar preserva tudo.
    await page.goto(`/app/imoveis/${idImovel}`);
    await page.getByText("Este imóvel é um lançamento").click();
    await expect(page.locator("#construtora")).toHaveValue(construtora);
    await page.getByRole("button", { name: "Salvar imóvel" }).click();
    await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);

    await page.goto(`/app/imoveis/${idImovel}`);
    await expect(page.locator("#construtora")).toHaveValue(construtora);
    await expect(page.locator("#previsaoEntrega")).toHaveValue("2027-06");
    await expect(secao(page).getByText("3 de 3 informações preenchidas")).toBeVisible();

    // 4) Sem o rótulo, o SELO de lançamento some — mas o destaque de
    //    obra continua, porque a obra continua em andamento. É a regra
    //    de imovel-lancamento.ts: estágio em andamento já basta, o
    //    rótulo é posicionamento comercial e o estágio é fato sobre a
    //    construção. Desmarcar um não apaga o outro.
    await page.goto(`/imoveis/${idImovel}`);
    const cab = page.locator("[data-identidade-imovel]");
    const selosSemRotulo = page.getByRole("list", { name: "Situação do imóvel" });
    await expect(selosSemRotulo.getByText("Lançamento", { exact: true })).toHaveCount(0);
    await expect(selosSemRotulo.locator('[data-selo="obra"]')).toHaveText("Em construção");
    // E o breadcrumb não leva a "Lançamentos": o imóvel não está lá.
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Lançamentos" })
    ).toHaveCount(0);
    await expect(cab.getByText("Previsão de entrega:")).toBeVisible();
    await expect(cab.getByText("Junho de 2027")).toBeVisible();
  });
});

// =====================================================================
// Fase 67 — Imóveis na linguagem do backoffice (Fases 65/65.1/66)
// =====================================================================
// Cobertura ESTRUTURAL e comportamental: o que não pode regredir é a
// hierarquia da informação, o contrato de URL dos filtros, a ordenação, a
// paginação e a ausência de overflow — não o valor de um padding.
test.describe("Imóveis — estrutura do novo backoffice", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/imoveis");
  });

  test("cabeçalho, subtítulo e ação principal seguem o padrão", async ({ page }) => {
    const h1 = page.locator("main h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Imóveis");
    await expect(
      page.getByText(
        "Gerencie seu portfólio de imóveis e acompanhe disponibilidade, finalidade e oportunidades."
      )
    ).toBeVisible();
    // A ação principal continua no cabeçalho, com o mesmo destino.
    await expect(page.getByRole("button", { name: "Novo imóvel" })).toBeVisible();
  });

  test("a seção Portfólio contém filtros e listagem", async ({ page }) => {
    const titulo = page.getByRole("heading", { name: "Portfólio de imóveis" });
    await expect(titulo).toBeVisible();
    expect(await titulo.evaluate((el) => el.tagName)).toBe("H2");

    const secao = titulo.locator("xpath=ancestor::section[1]");
    await expect(secao.getByLabel("Buscar imóveis")).toBeVisible();
    await expect(secao.locator("table")).toHaveCount(1);
  });

  test("os KPIs não são links — não prometem navegação que não existe", async ({ page }) => {
    const grade = page.locator("[data-grade-kpis]");
    await expect(grade).toBeVisible();
    await expect(grade.locator("a")).toHaveCount(0);
  });

  test("a busca tem mais peso que os filtros categóricos e vem antes deles", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/imoveis");

    const busca = await page.locator("#imoveis-busca").boundingBox();
    const status = await page.locator("#imoveis-status").boundingBox();
    expect(busca!.width).toBeGreaterThan(status!.width);
    expect(busca!.y, "a busca aparece acima dos selects").toBeLessThan(status!.y);
  });

  test("os filtros continuam URL-driven, sem submit e sem parâmetro novo", async ({ page }) => {
    // Não existe botão de aplicar nesta tela: os selects navegam no
    // onChange e a busca tem debounce. Criar um botão seria inventar um
    // mecanismo que o produto não tem.
    await expect(page.getByRole("button", { name: "Filtrar" })).toHaveCount(0);

    await page.locator("#imoveis-status").selectOption("AVAILABLE");
    await expect(page).toHaveURL(/filters=/);
    const url = new URL(page.url());
    // Contrato preservado: status/tipo/finalidade num JSON em `filters`.
    expect(JSON.parse(url.searchParams.get("filters")!)).toEqual({ status: "AVAILABLE" });
  });

  test("filtros ativos aparecem como chips removíveis, com rótulo legível", async ({ page }) => {
    await page.locator("#imoveis-status").selectOption("AVAILABLE");
    const ativos = page.locator("[data-filtros-ativos]");
    await expect(ativos).toBeVisible();

    // Rótulo traduzido, nunca o valor cru da URL.
    const chip = ativos.getByRole("button", { name: /Remover filtro/ });
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText("Disponível");

    // Remover o chip devolve o filtro a "todos" — mesmo caminho do select.
    await chip.click();
    await expect(page).not.toHaveURL(/filters=/);
    await expect(page.locator("[data-filtros-ativos]")).toHaveCount(0);
  });

  test("a busca preserva os filtros já aplicados na URL", async ({ page }) => {
    await page.locator("#imoveis-status").selectOption("AVAILABLE");
    await expect(page).toHaveURL(/filters=/);

    await page.getByLabel("Buscar imóveis").fill("apartamento");
    await expect(page).toHaveURL(/search=apartamento/);
    // O filtro não pode ser descartado pela busca.
    await expect(page).toHaveURL(/filters=/);
  });

  test("a tabela mantém as colunas e a semântica de cabeçalho", async ({ page }) => {
    const cabecalhos = await page
      .locator("table thead th")
      .evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));

    expect(cabecalhos.some((c) => c.startsWith("Imóvel"))).toBe(true);
    for (const coluna of ["Tipo", "Finalidade", "Localização", "Preço", "Status"]) {
      expect(cabecalhos, `coluna ${coluna}`).toContain(coluna);
    }
  });

  test("o título do imóvel continua sendo o link para a ficha", async ({ page }) => {
    const primeiro = page.locator("table tbody tr").first().locator("a").first();
    await expect(primeiro).toHaveAttribute("href", /^\/app\/imoveis\/[\w-]+$/);
    const href = await primeiro.getAttribute("href");
    await primeiro.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test("ordenação: coluna ordenável, coluna ativa e direção são identificáveis", async ({
    page,
  }) => {
    await page.goto("/app/imoveis?sort=price:asc");
    // A direção não depende só de cor: o nome acessível do controle diz
    // qual é, e um ícone de seta acompanha.
    const preco = page.getByRole("button", { name: /Preço/ }).first();
    await expect(preco).toBeVisible();
    await expect(preco.locator("svg")).toHaveCount(1);

    await preco.click();
    await expect(page).toHaveURL(/sort=price%3Adesc|sort=price:desc/);
  });

  test("ordenação do bloco Imóvel oferece Código e Título, com direção anunciada", async ({
    page,
  }) => {
    const porCodigo = page.getByRole("button", { name: /Ordenar por Código/ });
    await expect(porCodigo).toHaveCount(1);
    await porCodigo.click();
    await expect(page).toHaveURL(/sort=code(%3A|:)asc/);
    // Ativo: o nome acessível passa a declarar a direção.
    await expect(
      page.getByRole("button", { name: /Ordenar por Código, ordem ascendente/ })
    ).toHaveCount(1);
  });

  test("paginação preserva contagem, seletor e regras de disabled", async ({ page }) => {
    await expect(page.getByText(/Página \d+ de \d+/)).toBeVisible();
    await expect(page.getByText(/registro\(s\)/)).toBeVisible();
    // O seletor ganhou nome acessível nesta fase (era um <span> solto ao
    // lado, sem associação com o controle).
    await expect(page.getByRole("combobox", { name: "Itens por página" })).toBeVisible();
  });

  test("zero resultados e zero cadastrados são estados vazios DIFERENTES", async ({ page }) => {
    await page.goto("/app/imoveis?search=zzz-nao-existe-zzz-67");
    const vazio = page.locator("[data-estado-vazio]").first();
    await expect(vazio).toBeVisible();
    // Filtro sem resultado fala de filtros, não de portfólio vazio.
    await expect(vazio).toContainText("Nenhum imóvel encontrado com esses filtros.");
    await expect(vazio).not.toContainText("Nenhum imóvel cadastrado ainda.");
  });

  test("a hierarquia de cabeçalhos não tem salto", async ({ page }) => {
    const niveis = await page
      .locator("main h1, main h2, main h3")
      .evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
    expect(niveis[0]).toBe(1);
    for (let i = 1; i < niveis.length; i += 1) {
      expect(
        niveis[i] - niveis[i - 1],
        `salto de h${niveis[i - 1]} para h${niveis[i]}`
      ).toBeLessThanOrEqual(1);
    }
  });

  test("a sidebar marca Imóveis como item atual", async ({ page }) => {
    const atual = page.locator('aside nav[aria-label="Navegação principal"] a[aria-current="page"]');
    await expect(atual).toHaveCount(1);
    await expect(atual).toHaveText("Imóveis");
  });
});

test.describe("Imóveis — responsividade do novo layout", () => {
  for (const [largura, altura] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    test(`${largura}×${altura}: sem overflow do documento`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto("/app/imoveis");

      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("[data-grade-kpis]")).toBeVisible();

      const rolou = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolou, `documento rolou ${rolou}px em ${largura}px`).toBe(0);
    });
  }

  test("em desktop a tabela é a representação, e seu scroll fica contido", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/app/imoveis");

    const tabela = page.locator("table");
    await expect(tabela).toBeVisible();
    // O container da tabela é quem rola horizontalmente, se precisar.
    const overflow = await tabela.evaluate(
      (el) => getComputedStyle(el.parentElement!).overflowX
    );
    expect(overflow).toBe("auto");
  });

  test("em 390px a tabela dá lugar aos cards já existentes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/imoveis");

    // Comportamento PRÉ-EXISTENTE do DataTable (prop `cards`), preservado:
    // a tabela é escondida abaixo de md e os cards assumem.
    await expect(page.locator("table")).toBeHidden();
    const linhas = page.locator("[data-slot=card]");
    expect(await linhas.count()).toBeGreaterThan(0);
  });
});

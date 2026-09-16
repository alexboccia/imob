import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E, ORG_RECURSOS, login } from "./helpers";

// =======================================================================
// O que tem por perto (Fase 42)
// =======================================================================
// Admin: a seção nova é gêmea estrutural do card de Características, e o
// corretor cadastra, edita, limpa a distância, reordena e remove locais
// sem sair do formulário. Público: a lista aparece na ordem salva, depois
// da Localização, e nunca mostra placeholder de distância.

const BASE = "/e2e-org-recursos";
const ficha = (id: string) => `${BASE}/imoveis/${id}`;
const edicao = (id: string) => `/app/imoveis/${id}`;
const LARGURAS = [320, 390, 768, 1280, 1440];

const TITULO = "O que tem por perto";
const DESCRICAO =
  "Cadastre os principais serviços, comércios e pontos de interesse próximos ao imóvel.";

function secaoPublica(page: Page) {
  return page.locator("[data-locais-proximos]");
}

function cardPorTitulo(page: Page, titulo: string): Locator {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${titulo}$`) }),
  });
}

async function semOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

// -----------------------------------------------------------------------
// Ficha pública
// -----------------------------------------------------------------------
test("a ficha lista os locais na ordem salva, sem placeholder de distância", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelComLocais));

  const secao = secaoPublica(page);
  await expect(secao).toHaveCount(1);
  await expect(secao.getByRole("heading", { name: TITULO })).toBeVisible();

  const itens = secao.getByRole("listitem");
  await expect(itens).toHaveCount(3);
  await expect(itens.nth(0)).toContainText("Mercado Central E2E");
  await expect(itens.nth(0)).toContainText("Mercado · 350 m");
  await expect(itens.nth(1)).toContainText("Estacao Paraiso E2E");
  await expect(itens.nth(1)).toContainText("Metrô · 1,2 km");
  await expect(itens.nth(2)).toContainText("Praca das Arvores E2E");

  // Sem distância, a linha diz só a categoria — nada depois dela.
  const semDistancia = (await itens.nth(2).innerText()).trim();
  expect(semDistancia).toMatch(/Parque$/);
  expect(await secao.innerText()).not.toMatch(/—|não informad|sem distância|\bnull\b/i);

  // Ícones decorativos, um por local.
  await expect(secao.locator("svg[aria-hidden='true']")).toHaveCount(3);
});

test("a seção vem logo depois da Localização", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelComLocais));
  const localizacao = await page.getByRole("heading", { name: "Localização" }).boundingBox();
  const secao = await secaoPublica(page).boundingBox();
  expect(localizacao).not.toBeNull();
  expect(secao).not.toBeNull();
  expect(secao!.y).toBeGreaterThan(localizacao!.y);
});

test("imóvel sem locais não ganha seção nem título vazio", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelSemRecursos));
  await expect(page.getByRole("heading", { name: "Localização" })).toBeVisible();
  await expect(secaoPublica(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: TITULO })).toHaveCount(0);
});

test.describe("ficha pública — responsivo", () => {
  for (const largura of LARGURAS) {
    test(`${largura}px: a lista cabe na tela`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(ficha(IDS_E2E.imovelComLocais));
      const caixa = await secaoPublica(page).boundingBox();
      expect(caixa, `sem seção @ ${largura}px`).not.toBeNull();
      expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(largura + 1);
      expect(await semOverflow(page), `overflow @ ${largura}px`).toBe(true);

      // Colunas: três por linha a partir de 768 (md), uma no celular.
      const itens = secaoPublica(page).getByRole("listitem");
      await expect(itens).toHaveCount(3);
      const caixas = await Promise.all([0, 1, 2].map(async (i) => (await itens.nth(i).boundingBox())!));
      if (largura >= 768) {
        expect(Math.abs(caixas[1].y - caixas[0].y)).toBeLessThan(1);
        expect(Math.abs(caixas[2].y - caixas[0].y)).toBeLessThan(1);
        expect(caixas[1].x).toBeGreaterThan(caixas[0].x + caixas[0].width);
        expect(caixas[2].x).toBeGreaterThan(caixas[1].x + caixas[1].width);
        // Resumo inteiro numa linha: "Metrô · 1,2 km" não quebra.
        const resumo = itens.nth(1).locator("p").nth(1);
        const alturaLinha = await resumo.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
        expect((await resumo.boundingBox())!.height).toBeLessThan(alturaLinha * 1.5);
      } else {
        expect(caixas[1].y).toBeGreaterThan(caixas[0].y);
        expect(caixas[2].y).toBeGreaterThan(caixas[1].y);
      }
    });
  }
});

// -----------------------------------------------------------------------
// Admin — paridade estrutural com "Características"
// -----------------------------------------------------------------------
test.describe("admin — mesma anatomia do card de Características", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_RECURSOS);
  });

  test("título, descrição, largura e classes idênticas; sem card aninhado", async ({ page }) => {
    await page.goto(edicao(IDS_E2E.imovelComLocais));

    const referencia = cardPorTitulo(page, "Características");
    const novo = cardPorTitulo(page, TITULO);
    await expect(referencia).toHaveCount(1);
    await expect(novo).toHaveCount(1);

    await expect(novo.locator('[data-slot="card-description"]')).toHaveText(DESCRICAO);

    // Mesma árvore de slots, com as MESMAS classes em cada nível.
    const anatomia = (card: Locator) =>
      card.evaluate((el) => {
        const cls = (sel: string) => el.querySelector(`:scope > ${sel}`)?.getAttribute("class");
        const header = el.querySelector(':scope > [data-slot="card-header"]');
        return {
          card: el.getAttribute("class"),
          header: cls('[data-slot="card-header"]'),
          titulo: header?.querySelector('[data-slot="card-title"]')?.getAttribute("class"),
          descricao: header?.querySelector('[data-slot="card-description"]')?.getAttribute("class"),
          conteudo: cls('[data-slot="card-content"]'),
          filhos: Array.from(el.children).map((c) => c.getAttribute("data-slot")),
        };
      });
    expect(await anatomia(novo)).toEqual(await anatomia(referencia));

    // Nenhum card dentro do card.
    await expect(novo.locator('[data-slot="card"]')).toHaveCount(0);

    // Mesma coluna: mesmo x e mesma largura.
    const a = await referencia.boundingBox();
    const b = await novo.boundingBox();
    expect(b!.x).toBeCloseTo(a!.x, 0);
    expect(b!.width).toBeCloseTo(a!.width, 0);
  });

  // O menu lateral muda a largura do card sem mudar a da janela: a linha
  // Categoria | Nome | Distância depende da largura do EDITOR (container
  // query de 42rem = 672px), e é ela que o teste consulta.
  const LINHA_A_PARTIR_DE = 672;

  /** Geometria do controle de distância e dos vizinhos, com hit target. */
  async function medirControles(card: Locator) {
    const distancia = card.getByLabel("Distância (opcional)").first();
    return distancia.evaluate((input) => {
      const caixa = (el: Element) => el.getBoundingClientRect();
      // O pai direto é o grupo em qualquer versão do markup.
      const grupo = input.closest("[data-grupo-distancia]") ?? input.parentElement!;
      const select = grupo.querySelector("select")!;
      const editor = input.closest('[data-testid="editor-locais-proximos"]')!;
      const card = input.closest('[data-slot="card"]')!;
      const linha = grupo.parentElement!.parentElement!;
      const categoria = linha.querySelector("select:not([aria-label])")!;
      const nome = linha.querySelector("input[maxlength]")!;
      const ri = caixa(input);
      const rs = caixa(select);
      const alvo = (r: DOMRect) => document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const util = ri.width - parseFloat(getComputedStyle(input).paddingLeft) -
        parseFloat(getComputedStyle(input).paddingRight) -
        parseFloat(getComputedStyle(input).borderLeftWidth) -
        parseFloat(getComputedStyle(input).borderRightWidth);
      return {
        input: { x: ri.x, y: ri.y, w: ri.width, h: ri.height, util },
        select: { x: rs.x, y: rs.y, w: rs.width, h: rs.height },
        grupo: caixa(grupo).toJSON() as DOMRect,
        card: caixa(card).toJSON() as DOMRect,
        editorLargura: caixa(editor).width,
        categoria: caixa(categoria).toJSON() as DOMRect,
        nome: caixa(nome).toJSON() as DOMRect,
        alvoInput: alvo(ri) === input,
        alvoSelect: alvo(rs) === select,
        overflowPagina: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
  }

  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: distância utilizável, unidade compacta, linha só com espaço real`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(edicao(IDS_E2E.imovelComLocais));
      const card = cardPorTitulo(page, TITULO);
      await card.getByLabel("Distância (opcional)").first().scrollIntoViewIfNeeded();
      const m = await medirControles(card);

      // Regressão do colapso: o select carregava `w-full` e `w-20`, o
      // `w-full` vencia e o campo ficava com 22px — ZERO px úteis depois
      // do padding. Digitar "funcionava", mas nada aparecia.
      expect(m.input.w, `campo de distância @ ${largura}px`).toBeGreaterThanOrEqual(100);
      expect(m.input.util, `área de texto do campo @ ${largura}px`).toBeGreaterThanOrEqual(70);
      expect(m.select.w, `unidade @ ${largura}px`).toBeGreaterThanOrEqual(72);
      expect(m.select.w, `unidade @ ${largura}px`).toBeLessThanOrEqual(88);
      expect(m.input.w).toBeGreaterThan(m.select.w);

      // Lado a lado, mesma altura, sem sobreposição.
      expect(Math.abs(m.select.y - m.input.y)).toBeLessThan(1);
      expect(Math.abs(m.select.h - m.input.h)).toBeLessThan(1);
      expect(m.select.x).toBeGreaterThanOrEqual(m.input.x + m.input.w);

      // O centro de cada controle é dele mesmo — nada o cobre.
      expect(m.alvoInput, `algo cobre o campo @ ${largura}px`).toBe(true);
      expect(m.alvoSelect, `algo cobre a unidade @ ${largura}px`).toBe(true);

      // Tudo dentro do grupo, e o grupo dentro do card.
      for (const [nome, b] of [["campo", m.input], ["unidade", m.select]] as const) {
        expect(b.x, `${nome} fora do grupo @ ${largura}px`).toBeGreaterThanOrEqual(m.grupo.x - 0.5);
        expect(b.x + b.w, `${nome} fora do grupo @ ${largura}px`).toBeLessThanOrEqual(
          m.grupo.x + m.grupo.width + 0.5
        );
      }
      expect(m.grupo.x + m.grupo.width).toBeLessThanOrEqual(m.card.x + m.card.width);
      expect(m.overflowPagina, `overflow @ ${largura}px`).toBe(false);

      // Vizinhos também utilizáveis.
      expect(m.nome.width, `nome do local @ ${largura}px`).toBeGreaterThanOrEqual(200);
      expect(m.categoria.width, `categoria @ ${largura}px`).toBeGreaterThanOrEqual(140);

      if (m.editorLargura >= LINHA_A_PARTIR_DE) {
        // Categoria | Nome | Distância numa linha.
        expect(Math.abs(m.nome.y - m.categoria.y)).toBeLessThan(1);
        expect(Math.abs(m.input.y - m.categoria.y)).toBeLessThan(1);
        expect(m.nome.x).toBeGreaterThan(m.categoria.x);
        expect(m.input.x).toBeGreaterThan(m.nome.x);
      } else {
        expect(m.nome.y).toBeGreaterThan(m.categoria.y);
        expect(m.input.y).toBeGreaterThan(m.nome.y);
      }
      // A decisão não é da viewport: em 768 o menu lateral deixa o editor
      // estreito, em 1024 já cabe a linha.
      if (largura === 768) expect(m.editorLargura).toBeLessThan(LINHA_A_PARTIR_DE);
      if (largura >= 1024) expect(m.editorLargura).toBeGreaterThanOrEqual(LINHA_A_PARTIR_DE);

      await expect(card.getByTestId("local-proximo")).toHaveCount(3);
    });
  }

  for (const largura of [390, 1280]) {
    test(`${largura}px: o corretor clica, digita, troca a unidade e adiciona`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      // Nada é salvo: o teste só mexe na lista do formulário.
      await page.goto(edicao(IDS_E2E.imovelComLocais));
      const card = cardPorTitulo(page, TITULO);
      const linhas = card.getByTestId("local-proximo");
      await expect(linhas).toHaveCount(3);

      const categoria = card.getByLabel("Categoria").first();
      const nome = card.getByLabel("Nome do local").first();
      const distancia = card.getByLabel("Distância (opcional)").first();
      const unidade = card.getByLabel("Unidade da distância").first();
      const adicionar = card.getByRole("button", { name: "Adicionar local" });

      // Clique de verdade no centro do campo: o foco vai para ele.
      await distancia.scrollIntoViewIfNeeded();
      await distancia.click();
      await expect(distancia).toBeFocused();

      // Digitação por teclado (não fill), apagar e redigitar.
      await page.keyboard.type("350");
      await expect(distancia).toHaveValue("350");
      for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
      await expect(distancia).toHaveValue("");
      await page.keyboard.type("1,2");
      await expect(distancia).toHaveValue("1,2");
      await distancia.fill("1,15");
      await expect(distancia).toHaveValue("1,15");
      // O texto digitado cabe inteiro na área visível do campo.
      expect(
        await distancia.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth)
      ).toBe(true);

      // Tab a partir do nome alcança a distância.
      await nome.focus();
      await page.keyboard.press("Tab");
      await expect(distancia).toBeFocused();

      // 350 m: trocar unidade, categoria e nome não apaga a distância.
      await distancia.fill("350");
      await unidade.selectOption("KILOMETERS");
      await unidade.selectOption("METERS");
      await categoria.selectOption("PHARMACY");
      await nome.fill("Farmacia Teclado");
      await expect(distancia).toHaveValue("350");
      await adicionar.click();
      await expect(linhas.last()).toContainText("Farmacia Teclado");
      await expect(linhas.last()).toContainText("Farmácia · 350 m");
      // O formulário de adição volta limpo.
      await expect(distancia).toHaveValue("");

      // 1,2 km
      await categoria.selectOption("SUBWAY");
      await nome.fill("Estacao Teclado");
      await distancia.click();
      await page.keyboard.type("1,2");
      await unidade.selectOption("KILOMETERS");
      await expect(distancia).toHaveValue("1,2");
      await adicionar.click();
      await expect(linhas.last()).toContainText("Metrô · 1,2 km");

      // Inválido: mensagem no campo, nada entra na lista...
      await categoria.selectOption("PARK");
      await nome.fill("Parque Teclado");
      await distancia.fill("abc");
      await adicionar.click();
      const mensagem = card.getByText("Informe a distância só com números, ex.: 350 ou 1,2.");
      await expect(mensagem).toBeVisible();
      await expect(distancia).toHaveAttribute("aria-invalid", "true");
      await expect(linhas).toHaveCount(5);
      const campo = (await distancia.boundingBox())!;
      const msg = (await mensagem.boundingBox())!;
      expect(msg.y).toBeGreaterThan(campo.y + campo.height);
      expect(Math.abs(msg.x - campo.x)).toBeLessThan(1);

      // ...e o campo continua utilizável: corrigir e adicionar.
      await distancia.click();
      await expect(distancia).toBeFocused();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("1,15");
      await expect(distancia).toHaveValue("1,15");
      await unidade.selectOption("KILOMETERS");
      await adicionar.click();
      await expect(mensagem).toHaveCount(0);
      await expect(linhas.last()).toContainText("Parque · 1,15 km");
      await expect(linhas).toHaveCount(6);
    });
  }

  test("a edição inline usa o mesmo controle, largo e clicável", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(edicao(IDS_E2E.imovelComLocais));
    const card = cardPorTitulo(page, TITULO);
    const linha = card.getByTestId("local-proximo").nth(1);
    await linha.getByRole("button", { name: /^Editar local/ }).click();

    const distancia = linha.getByLabel("Distância (opcional)");
    await expect(distancia).toHaveValue("1,2");
    const m = await medirControles(linha);
    expect(m.input.w).toBeGreaterThanOrEqual(100);
    expect(m.alvoInput).toBe(true);
    expect(m.alvoSelect).toBe(true);

    await distancia.click();
    await expect(distancia).toBeFocused();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("1,15");
    await linha.getByRole("button", { name: "Salvar local" }).click();
    await expect(linha).toContainText("Metrô · 1,15 km");
  });
});

// -----------------------------------------------------------------------
// Admin — fluxo completo
// -----------------------------------------------------------------------
test("o corretor cadastra, edita, limpa a distância, reordena e remove", async ({ page }) => {
  await login(page, ORG_RECURSOS);
  await page.goto(edicao(IDS_E2E.imovelLocaisAdmin));
  const card = cardPorTitulo(page, TITULO);
  const linhas = card.getByTestId("local-proximo");

  // Retry do CI pode encontrar a lista de uma tentativa anterior: esvaziar
  // pela própria UI deixa o ponto de partida determinístico.
  while ((await linhas.count()) > 0) {
    await linhas.first().getByRole("button", { name: /^Remover local/ }).click();
  }
  await expect(card.getByText("Nenhum local cadastrado.", { exact: false })).toBeVisible();

  const categoria = card.getByLabel("Categoria").first();
  const nome = card.getByLabel("Nome do local").first();
  const distancia = card.getByLabel("Distância (opcional)").first();
  const unidade = card.getByLabel("Unidade da distância").first();
  const adicionar = card.getByRole("button", { name: "Adicionar local" });

  // Validação inline: sem categoria nem nome, nada entra na lista.
  await adicionar.click();
  await expect(card.getByText("Escolha a categoria.")).toBeVisible();
  await expect(card.getByText("Informe o nome do local.")).toBeVisible();
  await expect(linhas).toHaveCount(0);

  // Metros fracionados são recusados antes de chegar ao servidor.
  await categoria.selectOption({ label: "Farmácia" });
  await nome.fill("Drogaria Admin E2E");
  await distancia.fill("1,5");
  await adicionar.click();
  await expect(card.getByText(/Em metros, use um número inteiro/)).toBeVisible();
  await expect(linhas).toHaveCount(0);

  await distancia.fill("200");
  await adicionar.click();
  await expect(linhas).toHaveCount(1);
  // O formulário de adição volta ao estado inicial.
  await expect(nome).toHaveValue("");
  await expect(distancia).toHaveValue("");

  await categoria.selectOption({ label: "Metrô" });
  await nome.fill("Estacao Admin E2E");
  await distancia.fill("1,5");
  await unidade.selectOption({ label: "km" });
  await adicionar.click();

  // Enter no nome adiciona o local — não envia o formulário do imóvel.
  await categoria.selectOption({ label: "Escola" });
  await nome.fill("Escola Admin E2E");
  await nome.press("Enter");
  await expect(linhas).toHaveCount(3);
  await expect(page).not.toHaveURL(/salvo=1/);

  await expect(linhas.nth(0)).toContainText("Farmácia · 200 m");
  await expect(linhas.nth(1)).toContainText("Metrô · 1,5 km");
  await expect(linhas.nth(2)).toContainText("Escola");
  expect((await linhas.nth(2).locator("p").nth(1).innerText()).trim()).toBe("Escola");

  // Salvar e recarregar: persistiu na ordem.
  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await page.waitForURL(/\?salvo=1/);
  await page.reload();
  await expect(linhas).toHaveCount(3);
  await expect(linhas.nth(0)).toContainText("Drogaria Admin E2E");
  await expect(linhas.nth(1)).toContainText("Estacao Admin E2E");
  await expect(linhas.nth(2)).toContainText("Escola Admin E2E");

  // Editar inline: renomear e LIMPAR só a distância do metrô.
  await linhas.nth(1).getByRole("button", { name: "Editar local Estacao Admin E2E" }).click();
  const emEdicao = linhas.nth(1);
  await expect(emEdicao.getByLabel("Distância (opcional)")).toHaveValue("1,5");
  await expect(emEdicao.getByLabel("Unidade da distância")).toHaveValue("KILOMETERS");
  await emEdicao.getByLabel("Nome do local").fill("Estacao Renomeada E2E");
  await emEdicao.getByLabel("Distância (opcional)").fill("");
  await emEdicao.getByRole("button", { name: "Salvar local" }).click();
  await expect(linhas).toHaveCount(3);
  await expect(linhas.nth(1)).toContainText("Estacao Renomeada E2E");
  expect((await linhas.nth(1).locator("p").nth(1).innerText()).trim()).toBe("Metrô");

  // Cancelar não altera nada.
  await linhas.nth(0).getByRole("button", { name: /^Editar local/ }).click();
  await linhas.nth(0).getByLabel("Nome do local").fill("Nao Deveria Ficar");
  await linhas.nth(0).getByRole("button", { name: "Cancelar" }).click();
  await expect(linhas.nth(0)).toContainText("Drogaria Admin E2E");

  // Reordenar: a escola sobe para o topo.
  const subirEscola = page.getByRole("button", { name: "Mover Escola Admin E2E para cima" });
  await subirEscola.click();
  await subirEscola.click();
  await expect(subirEscola).toBeDisabled();
  await expect(linhas.nth(0)).toContainText("Escola Admin E2E");
  await expect(
    page.getByRole("button", { name: "Mover Estacao Renomeada E2E para baixo" })
  ).toBeDisabled();

  // Remover a farmácia (agora a segunda).
  await page.getByRole("button", { name: "Remover local Drogaria Admin E2E" }).click();
  await expect(linhas).toHaveCount(2);

  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await page.waitForURL(/\?salvo=1/);
  await page.reload();
  await expect(linhas).toHaveCount(2);
  await expect(linhas.nth(0)).toContainText("Escola Admin E2E");
  await expect(linhas.nth(1)).toContainText("Estacao Renomeada E2E");

  // A ficha pública reflete a mesma lista, na mesma ordem.
  await page.goto(ficha(IDS_E2E.imovelLocaisAdmin));
  const itens = secaoPublica(page).getByRole("listitem");
  await expect(itens).toHaveCount(2);
  await expect(itens.nth(0)).toContainText("Escola Admin E2E");
  await expect(itens.nth(1)).toContainText("Estacao Renomeada E2E");
  expect(await secaoPublica(page).innerText()).not.toContain("Drogaria Admin E2E");
  expect(await secaoPublica(page).innerText()).not.toMatch(/—|não informad/i);

  // Esvaziar: a seção some da ficha.
  await page.goto(edicao(IDS_E2E.imovelLocaisAdmin));
  while ((await linhas.count()) > 0) {
    await linhas.first().getByRole("button", { name: /^Remover local/ }).click();
  }
  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await page.waitForURL(/\?salvo=1/);
  await page.goto(ficha(IDS_E2E.imovelLocaisAdmin));
  await expect(secaoPublica(page)).toHaveCount(0);
});

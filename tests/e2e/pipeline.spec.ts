import { test, expect } from "@playwright/test";
import { ORG_A, ORG_CENTRAL, login } from "./helpers";

// Redesenho do Pipeline — fluxo completo: cria um cliente, relaciona um
// imóvel (RelacionarImovelForm, já existente — cria um PropertyInterest
// real stage=INTERESTED), confirma que o card aparece na etapa certa do
// Kanban, exercita filtro de prioridade e busca, abre o drawer da
// negociação, move de etapa, fecha como ganho, e confirma que aparece em
// "Encerradas". Nomes com timestamp pra nunca colidir entre execuções
// (Person só é limpa no global-setup, não entre specs).
test.describe("Pipeline", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
  });

  test("KPIs renderizam, card aparece na etapa certa, filtro de prioridade, busca, abre negociação, move etapa, marca como ganho", async ({
    page,
  }) => {
    const nomeUnico = `Cliente Pipeline E2E ${Date.now()}`;
    // Telefone também precisa ser único por organização
    // (@@unique([organizationId, phoneNormalized]) em Person) — um valor
    // fixo colidiria com o cliente que clientes.spec.ts já cria na mesma
    // ORG_A, dentro da mesma rodada de E2E (Person só é limpa no
    // global-setup do seed, não entre specs).
    const telefoneUnico = `119${String(Date.now()).slice(-8)}`;

    // Cria o cliente e relaciona o imóvel seedado (mesmo fluxo real do
    // produto — sem seed extra, sem atalho de banco).
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nomeUnico);
    await page.getByPlaceholder("Telefone/WhatsApp").fill(telefoneUnico);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nomeUnico);
    await page.waitForURL(/search=/);
    await page.getByRole("row", { name: new RegExp(nomeUnico) }).getByText("Novo lead").click();
    await page
      .locator('[data-slot="sheet-content"]')
      .filter({ hasText: nomeUnico })
      .getByRole("button", { name: "Ver perfil completo" })
      .click();
    await page.waitForURL(/\/app\/clientes\/.+/);

    // Fase 34 — passou a usar o POOL de imóveis de fechamento em vez do
    // imóvel seedado compartilhado. Dois motivos: este spec GANHA a
    // negociação, e ganhar agora tira o imóvel de circulação — o antigo
    // estava na vitrine da Home, que passava a mostrar três cards em vez
    // de quatro. E, de quebra, some o acoplamento com imoveis.spec.ts,
    // que renomeava aquele título no meio da execução.
    await page.getByRole("combobox", { name: "Imóvel" }).click();
    const opcaoImovel = page.getByRole("option", { name: /^A00 Negocio E2E/ }).first();
    const tituloImovel = (await opcaoImovel.textContent()) ?? "Apartamento E2E";
    await opcaoImovel.click();
    await page.getByRole("button", { name: "Relacionar imóvel" }).click();
    await expect(page.getByText(tituloImovel)).toBeVisible();

    // KPIs — sempre renderizam, mesmo antes de checar o card.
    await page.goto("/app/pipeline");
    await expect(page.getByText("Em andamento", { exact: true })).toBeVisible();
    await expect(page.getByText("Ganhos", { exact: true })).toBeVisible();
    await expect(page.getByText("Perdidos", { exact: true })).toBeVisible();
    await expect(page.getByText("Taxa de ganho", { exact: true })).toBeVisible();

    // Card aparece na coluna "Interessado" (stage inicial de
    // criarInteressePessoa), não em nenhuma outra.
    // Fase 66 — a coluna ganhou âncora estável (data-coluna-pipeline com
    // o valor do estágio). Antes o teste subia do <h2> para o pai por
    // travessia de DOM, o que quebrava a cada mudança de estrutura e a
    // cada ajuste de nível de heading (a coluna virou <h3>, porque agora
    // vive sob o <h2> da seção "Negociações"). A âncora prova a mesma
    // coisa — o card está NESTA etapa — sem depender do layout.
    const colunaInteressado = page.locator('[data-coluna-pipeline="INTERESTED"]');
    const card = colunaInteressado.locator("div", { hasText: nomeUnico }).last();
    await expect(card).toBeVisible();
    await expect(card.getByText(tituloImovel)).toBeVisible();
    await expect(card.getByText("Centro")).toBeVisible();

    // Filtro de prioridade — negociação recém-criada, sem visita/aging
    // relevante, classifica como NORMAL (Fase P.8) — some do filtro "Alta",
    // continua no filtro "Normal".
    await page.getByRole("link", { name: /^Alta \(\d+\)$/ }).click();
    await expect(page.getByText(nomeUnico)).not.toBeVisible();
    await page.getByRole("link", { name: /^Normal \(\d+\)$/ }).click();
    await expect(page.getByText(nomeUnico)).toBeVisible();
    await page.getByRole("link", { name: /^Todas \(\d+\)$/ }).click();

    // Busca — sem resultado pra um nome inexistente, com resultado pro
    // nome real.
    await page.getByPlaceholder("Buscar cliente ou imóvel...").fill("Nome Que Nunca Existe Zzz");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText("Nenhuma negociação encontrada com estes filtros.")).toBeVisible();
    await page.getByPlaceholder("Buscar cliente ou imóvel...").fill(nomeUnico);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText(nomeUnico)).toBeVisible();

    // Abre a negociação — drawer mostra os mesmos dados do card, fecha via
    // Esc (mesmo padrão do ClienteDrawer).
    await page.getByRole("button", { name: "Abrir negociação" }).click();
    const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: nomeUnico });
    await expect(drawer.getByRole("heading", { name: nomeUnico })).toBeVisible();
    await expect(drawer.getByText(tituloImovel)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer.getByRole("heading", { name: nomeUnico })).not.toBeVisible();

    // Move de etapa direto pelo card (MoverEstagioPipeline) — mesma Server
    // Action de sempre (atualizarEstagioInteresse), sem nova regra.
    const cardAtual = page.locator("div", { hasText: nomeUnico }).filter({ has: page.getByRole("button", { name: "Mover" }) });
    await cardAtual.getByRole("combobox", { name: "Mover para outra etapa" }).click();
    await page.getByRole("option", { name: "Visita agendada" }).click();
    await cardAtual.getByRole("button", { name: "Mover" }).click();
    await expect(page.getByText("Movendo...")).not.toBeVisible();

    const colunaVisita = page.locator('[data-coluna-pipeline="VISIT_SCHEDULED"]');
    await expect(colunaVisita.getByText(nomeUnico)).toBeVisible();

    // Marca como ganho — dentro do drawer (FechamentoInteresse), some do
    // Kanban "Em andamento" e passa a aparecer em "Encerradas".
    await page.getByRole("button", { name: "Abrir negociação" }).click();
    const drawerGanho = page.locator('[data-slot="sheet-content"]').filter({ hasText: nomeUnico });
    await drawerGanho.getByRole("button", { name: "Marcar como ganho" }).click();

    // Fase 9: fechar como ganho passou a exigir o VALOR NEGOCIADO, pedido
    // num diálogo — o corretor não registra mais um ganho sem perceber
    // que há dinheiro envolvido. CampoMoeda mascara centavos, então
    // "85000000" vira R$ 850.000,00.
    const dialogoGanho = page.getByRole("dialog");
    await expect(dialogoGanho).toBeVisible();
    await dialogoGanho.getByLabel("Valor de fechamento").fill("85000000");
    await dialogoGanho.getByRole("button", { name: "Confirmar ganho" }).click();
    await expect(dialogoGanho).not.toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Escape");

    await expect(page.getByText(nomeUnico)).not.toBeVisible();

    // A troca de aba preserva a busca ativa (mesmo comportamento de
    // sempre) — "Encerradas" já chega filtrada só pra este cliente.
    await page.getByRole("link", { name: /^Encerradas$/ }).click();
    await expect(page.getByText(nomeUnico)).toBeVisible();
    // O valor fechado passa a acompanhar o resultado na listagem.
    await expect(page.getByText(/^Ganho — R\$/)).toBeVisible();
  });

  // Estados vazios — filtro/busca sem nenhum resultado, independente de
  // quantas negociações já existam de execuções anteriores (Person/
  // PropertyInterest só são limpos no global-setup do seed, não entre
  // specs) — busca por um nome que nunca existiria é determinístico
  // independente da ordem de execução dos testes.
  test("estados vazios: busca sem resultado mostra mensagem neutra, sem erro", async ({ page }) => {
    await page.goto("/app/pipeline");
    await page.getByPlaceholder("Buscar cliente ou imóvel...").fill("Nome Que Nunca Existe Zzz Vazio");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText("Nenhuma negociação encontrada com estes filtros.")).toBeVisible();

    await page.getByRole("link", { name: /^Encerradas$/ }).click();
    await page.getByPlaceholder("Buscar cliente ou imóvel...").fill("Nome Que Nunca Existe Zzz Vazio");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText("Nenhuma negociação encontrada com estes filtros.")).toBeVisible();
  });

  // Mobile 375px — sem overflow horizontal do documento, mesmo critério de
  // tests/e2e/mobile-nav.spec.ts.
  test("375px: sem overflow horizontal do documento", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/app/pipeline");
    const semOverflowHorizontal = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflowHorizontal).toBe(true);

    await page.getByRole("link", { name: /^Encerradas$/ }).click();
    const semOverflowEncerradas = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflowEncerradas).toBe(true);
  });

  // Fase 11 — a cobertura parava em 375px, e o bug real morava JUSTO no
  // breakpoint `md`, onde o Kanban vira colunas lado a lado com scroll
  // horizontal próprio: um <Label> sr-only (position:absolute sem
  // left/top, portanto na posição estática) não tinha ancestral
  // posicionado, então o bloco contêiner dele era o documento — escapava
  // do overflow-x:auto do board e esticava a rolagem horizontal da PÁGINA
  // em ~100px. Aqui não basta comparar scrollWidth: o teste tenta ROLAR
  // de verdade, que é o sintoma que o corretor sente.
  for (const largura of [768, 1024, 1280, 1440]) {
    test(`${largura}px: a página não rola horizontalmente`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/pipeline");
      const scrollX = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(scrollX, `documento rolou ${scrollX}px em ${largura}px`).toBe(0);
    });
  }
});

// =====================================================================
// Fase 66 — Pipeline na linguagem do backoffice (Fases 65/65.1)
// =====================================================================
// A cobertura é ESTRUTURAL e semântica: o que não pode regredir é a
// hierarquia da informação, a semântica dos controles, os destinos e a
// ausência de overflow — não o valor de um padding.
test.describe("Pipeline — estrutura do novo backoffice", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/pipeline");
  });

  test("cabeçalho e KPIs seguem o padrão compartilhado", async ({ page }) => {
    const h1 = page.locator("main h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Pipeline");
    await expect(
      page.getByText("Acompanhe suas negociações e avance cada oportunidade até o fechamento.")
    ).toBeVisible();

    const grade = page.locator("[data-grade-kpis]");
    await expect(grade).toBeVisible();
    for (const rotulo of ["Em andamento", "Ganhos", "Perdidos", "Taxa de ganho"]) {
      await expect(grade.locator("[data-kpi-rotulo]", { hasText: rotulo }).first()).toBeVisible();
    }
    const valores = await grade.locator("[data-kpi-valor]").allTextContents();
    expect(valores).toHaveLength(4);
    // "Taxa de ganho" pode legitimamente ser "—" quando não há base para
    // calcular — nunca 0% inventado.
    expect(valores[3]).toMatch(/^(—|\d+([.,]\d+)?%)$/);
  });

  test("Em andamento/Encerradas continua navegação por URL, não tablist", async ({ page }) => {
    const barra = page.getByRole("navigation", { name: "Situação da negociação" });
    await expect(barra).toBeVisible();
    // A visão é resolvida no servidor por ?visao= — transformar em abas
    // ARIA seria mentir sobre o que acontece.
    await expect(barra.getByRole("tab")).toHaveCount(0);
    await expect(barra.getByRole("link")).toHaveCount(2);

    const ativa = barra.locator('[aria-current="page"]');
    await expect(ativa).toHaveCount(1);
    await expect(ativa).toContainText("Em andamento");
    // Estado dito em texto, não só por cor.
    await expect(ativa).toContainText("(situação atual)");

    await barra.getByRole("link", { name: /Encerradas/ }).click();
    await expect(page).toHaveURL(/visao=encerrada/);
    await expect(
      page.getByRole("navigation", { name: "Situação da negociação" }).locator('[aria-current="page"]')
    ).toContainText("Encerradas");
  });

  test("a seção Negociações contém filtros, prioridade e Kanban", async ({ page }) => {
    const titulo = page.getByRole("heading", { name: "Negociações" });
    await expect(titulo).toBeVisible();
    expect(await titulo.evaluate((el) => el.tagName)).toBe("H2");

    const secao = titulo.locator("xpath=ancestor::section[1]");
    await expect(secao.locator("[data-filtros-pipeline]")).toHaveCount(1);
    await expect(secao.getByText("Prioridade:")).toBeVisible();
    // O Kanban só existe quando há negociação aberta; na ORG_A (que outras
    // specs deixam sem negociação em andamento) a seção mostra o estado
    // vazio no lugar dele. A estrutura do Kanban é coberta abaixo, na
    // organização de seed determinístico.
    const temKanban = (await secao.locator("[data-kanban-pipeline]").count()) === 1;
    const temVazio = (await secao.locator("[data-estado-vazio]").count()) >= 1;
    expect(temKanban || temVazio, "a seção mostra o Kanban ou o estado vazio").toBe(true);
  });

  test("os filtros mantêm o botão de submissão — o form é GET sem JS", async ({ page }) => {
    const form = page.locator("[data-filtros-pipeline]");
    await expect(form).toHaveAttribute("method", "get");
    // Sem o botão, um <form method=get> sem JavaScript fica inoperante:
    // nem o input nem os <select> submetem sozinhos.
    await expect(form.getByRole("button", { name: "Filtrar" })).toBeVisible();

    // Os três controles pedidos continuam presentes, rotulados.
    await expect(form.getByLabel("Buscar")).toBeVisible();
    await expect(form.getByLabel("Período")).toBeVisible();
    await expect(form.getByLabel("Responsável")).toBeVisible();
  });

  test("a busca tem mais largura que os demais controles em desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/pipeline");

    const busca = await page.locator("#pipeline-q").boundingBox();
    const periodo = await page.locator("#pipeline-periodo").boundingBox();
    expect(busca!.width).toBeGreaterThan(periodo!.width);
  });

  test("prioridade continua links URL-driven, secundários à navegação", async ({ page }) => {
    const grupo = page.getByRole("navigation", { name: "Prioridade:" });
    await expect(grupo.getByRole("link")).toHaveCount(4);
    await expect(grupo.getByRole("tab")).toHaveCount(0);

    const ativo = grupo.locator('[aria-current="page"]');
    await expect(ativo).toHaveCount(1);
    await expect(ativo).toContainText("Todas");
    await expect(ativo).toContainText("(filtro ativo)");

    await grupo.getByRole("link", { name: /^Alta/ }).click();
    await expect(page).toHaveURL(/prioridade=ALTA/);
    await expect(
      page.getByRole("navigation", { name: "Prioridade:" }).locator('[aria-current="page"]')
    ).toContainText("Alta");
  });

  test("coluna vazia usa o estado vazio padrão, com texto para leitor de tela", async ({
    page,
  }) => {
    // Filtra por uma busca que não casa com nada: todas as colunas ficam
    // vazias de forma determinística, sem depender do seed.
    await page.goto("/app/pipeline?q=zzz-nao-existe-zzz-66");
    // Sem resultado nenhum, a página mostra o vazio da visão inteira.
    const vazios = page.locator("[data-estado-vazio]");
    expect(await vazios.count()).toBeGreaterThanOrEqual(1);
    await expect(vazios.first()).toContainText(/Nenhuma negociação/);
  });

  test("a análise do pipeline é seção na mesma página, com o expansor preservado", async ({
    page,
  }) => {
    const titulo = page.getByRole("heading", { name: "Análise do pipeline" });
    await expect(titulo).toBeVisible();
    expect(await titulo.evaluate((el) => el.tagName)).toBe("H2");
    await expect(
      page.getByText("Indicadores sobre movimentação e tempo das negociações.")
    ).toBeVisible();

    for (const rotulo of ["Gargalo atual", "Tempo médio até fechamento", "Transições no período"]) {
      await expect(page.locator("[data-kpi-rotulo]", { hasText: rotulo })).toBeVisible();
    }

    // "Ver análise completa" continua sendo expansão <details> na própria
    // página — nunca virou link para uma rota nova.
    const resumo = page.getByText("Ver análise completa");
    await expect(resumo).toBeVisible();
    const detalhes = page.locator("details");
    await expect(detalhes).toHaveJSProperty("open", false);
    await resumo.click();
    await expect(detalhes).toHaveJSProperty("open", true);
    await expect(page).toHaveURL(/\/app\/pipeline/);
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

  test("a sidebar marca Pipeline como item atual", async ({ page }) => {
    const atual = page.locator('aside nav[aria-label="Navegação principal"] a[aria-current="page"]');
    await expect(atual).toHaveCount(1);
    await expect(atual).toHaveText("Pipeline");
  });
});

test.describe("Pipeline — responsividade do novo layout", () => {
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
      await login(page, ORG_A);
      await page.goto("/app/pipeline");

      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("[data-grade-kpis]")).toBeVisible();

      // O Kanban pode rolar DENTRO do seu container; o documento, nunca.
      const rolou = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolou, `documento rolou ${rolou}px em ${largura}px`).toBe(0);
    });
  }

  test("390px: as colunas empilham", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, ORG_CENTRAL);
    await page.goto("/app/pipeline");

    const topos = await page
      .locator("[data-coluna-pipeline]")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    // Quatro colunas empilhadas: quatro topos distintos. (Sem o seed
    // determinístico este teste passaria com zero colunas, sem provar
    // nada — por isso a organização é a E, não a A.)
    expect(topos).toHaveLength(4);
    expect(new Set(topos).size).toBe(4);
  });

  test("1440px: as colunas ficam lado a lado, e o scroll fica DENTRO do Kanban", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, ORG_CENTRAL);
    await page.goto("/app/pipeline");

    const topos = await page
      .locator("[data-coluna-pipeline]")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(topos).toHaveLength(4);
    expect(new Set(topos).size, "as quatro etapas visíveis ao mesmo tempo").toBe(1);

    // Se as colunas não couberem, quem rola é o container do Kanban —
    // nunca o documento.
    const contido = await page
      .locator("[data-kanban-pipeline]")
      .evaluate((el) => getComputedStyle(el).overflowX);
    expect(contido).toBe("auto");
  });
});

// Estrutura do Kanban — na organização de seed DETERMINÍSTICO (Org E, com
// negociações abertas). A ORG_A depende do que outras specs deixaram para
// trás e chega a ter zero negociações em andamento, caso em que a página
// mostra o estado vazio e não há coluna nenhuma para inspecionar.
test.describe("Pipeline — Kanban com dados determinísticos", () => {
  test("o Kanban tem uma coluna por estágio do catálogo, com contagem", async ({ page }) => {
    await login(page, ORG_CENTRAL);
    await page.goto("/app/pipeline");

    const colunas = page.locator("[data-coluna-pipeline]");
    // Derivado de COLUNAS_ABERTAS (= ESTAGIOS_INTERESSE) — nunca escrito
    // à mão na página.
    const estagios = await colunas.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-coluna-pipeline"))
    );
    expect(estagios).toEqual(["INTERESTED", "VISIT_SCHEDULED", "VISITED", "PROPOSAL"]);

    for (const estagio of estagios) {
      const coluna = page.locator(`[data-coluna-pipeline="${estagio}"]`);
      // Cada coluna se nomeia e diz quantos itens tem.
      const cabecalho = coluna.locator("h3");
      await expect(cabecalho).toHaveCount(1);
      await expect(cabecalho).toContainText(/\d+/);
    }
  });

});

// =====================================================================
// Fase 66.1 — polimento: continuidade do Kanban, filtros, responsável
// =====================================================================
test.describe("Pipeline — polimento (dados determinísticos)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_CENTRAL);
    await page.goto("/app/pipeline");
  });

  test("a região do Kanban continua sendo quem rola, não o documento", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/app/pipeline");

    const kanban = page.locator("[data-kanban-pipeline]");
    const medida = await kanban.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      conteudo: el.scrollWidth,
      caixa: el.clientWidth,
    }));
    expect(medida.overflowX).toBe("auto");
    // Nesta largura as quatro colunas não cabem — é justamente o caso em
    // que a indicação de continuidade precisa existir.
    expect(medida.conteudo).toBeGreaterThan(medida.caixa);

    const rolouDocumento = await page.evaluate(() => {
      window.scrollTo(9999, 0);
      const x = window.scrollX;
      window.scrollTo(0, 0);
      return x;
    });
    expect(rolouDocumento, "o documento nunca rola horizontalmente").toBe(0);
  });

  test("existe indicação visual de continuidade horizontal, e ela é decorativa", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/app/pipeline");

    const kanban = page.locator("[data-kanban-pipeline]");
    const fundo = await kanban.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        imagens: s.backgroundImage,
        attachment: s.backgroundAttachment,
      };
    });

    // Quatro camadas: duas "tampas" que rolam com o conteúdo (local) e
    // duas sombras presas às bordas (scroll). É o que faz o indicador
    // sumir nas extremidades sem nenhum JavaScript.
    expect(fundo.imagens).toContain("linear-gradient");
    expect(fundo.attachment).toBe("local, local, scroll, scroll");

    // Decorativo por construção: o efeito vive no `background` do próprio
    // container de rolagem, então não entra na árvore de acessibilidade,
    // não recebe foco e não intercepta clique.
    //
    // A prova de que NENHUM overlay foi criado é que os filhos diretos do
    // Kanban continuam sendo exatamente as colunas — nada a mais.
    const filhos = await kanban.evaluate((el) =>
      Array.from(el.children).map((filho) => filho.getAttribute("data-coluna-pipeline"))
    );
    expect(filhos).toEqual(["INTERESTED", "VISIT_SCHEDULED", "VISITED", "PROPOSAL"]);
  });

  test("a indicação não bloqueia a interação com os cards", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/app/pipeline");

    // O card continua clicável: "Abrir negociação" abre o drawer.
    const botao = page.getByRole("button", { name: "Abrir negociação" }).first();
    await expect(botao).toBeVisible();
    await botao.click();
    await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible();
  });

  test("filtros e prioridade ficam próximos, e a prioridade continua abaixo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/pipeline");

    const filtros = await page.locator("[data-filtros-pipeline]").boundingBox();
    const prioridade = await page
      .getByRole("navigation", { name: "Prioridade:" })
      .boundingBox();

    // Ordem preservada: prioridade DEPOIS dos filtros.
    expect(prioridade!.y).toBeGreaterThan(filtros!.y);
    // Relacionados, mas não colados: o vão entre os dois é modesto.
    const vao = prioridade!.y - (filtros!.y + filtros!.height);
    expect(vao, `vão de ${vao}px entre filtros e prioridade`).toBeGreaterThan(0);
    expect(vao).toBeLessThanOrEqual(20);
  });

  test("responsável: rótulo, valor e 'Trocar' não se sobrepõem", async ({ page }) => {
    const trocar = page.locator("[data-trocar-responsavel]").first();
    await expect(trocar).toBeVisible();

    const caixaTrocar = await trocar.boundingBox();
    // O valor do responsável fica à esquerda do botão, sem invadi-lo.
    const valor = await trocar
      .locator("xpath=preceding-sibling::p[1]")
      .boundingBox();
    expect(valor).toBeTruthy();
    expect(
      valor!.x + valor!.width,
      "o valor termina antes do botão começar"
    ).toBeLessThanOrEqual(caixaTrocar!.x + 1);
  });

  test("'Trocar' continua ação secundária e abre o diálogo", async ({ page }) => {
    const trocar = page.locator("[data-trocar-responsavel]").first();
    // Discreta: sem fundo preenchido de botão primário.
    const fundo = await trocar.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(fundo).toBe("rgba(0, 0, 0, 0)");

    await trocar.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("um nome de responsável longo não alarga o card", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/pipeline");

    // Mede o card contra a coluna que o contém: quebra de texto correta
    // significa que o card nunca excede a largura da própria coluna.
    const medidas = await page
      .locator("[data-coluna-pipeline]")
      .evaluateAll((colunas) =>
        colunas.flatMap((coluna) => {
          const larguraColuna = coluna.clientWidth;
          return Array.from(coluna.querySelectorAll('[data-slot="card"]')).map((card) => ({
            card: Math.round(card.getBoundingClientRect().width),
            coluna: larguraColuna,
          }));
        })
      );

    expect(medidas.length).toBeGreaterThan(0);
    for (const m of medidas) {
      expect(m.card, `card de ${m.card}px numa coluna de ${m.coluna}px`).toBeLessThanOrEqual(
        m.coluna + 1
      );
    }
  });

  for (const largura of [1920, 1440, 1366, 1024, 768, 390]) {
    test(`${largura}px: responsável legível e documento sem overflow`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/pipeline");

      const trocar = page.locator("[data-trocar-responsavel]").first();
      await expect(trocar).toBeVisible();
      const caixa = await trocar.boundingBox();
      expect(caixa!.width, `"Trocar" com ${caixa!.width}px`).toBeGreaterThan(20);

      const rolou = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolou, `documento rolou ${rolou}px em ${largura}px`).toBe(0);
    });
  }
});

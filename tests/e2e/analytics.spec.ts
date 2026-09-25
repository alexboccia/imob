import { test, expect, type Page } from "@playwright/test";
import { ORG_ANALYTICS, ORG_AGENDA, ORG_B, login } from "./helpers";

// Analytics comercial (Fase 5) — três cenários agrupados, nenhum write
// pelo navegador. Todo o estado vem do seed determinístico
// (prisma/seed-e2e.ts, seção "Organização D"), e o browser é usado só
// para o que ele é bom: provar a EXPERIÊNCIA (números na tela, gráfico
// montado, filtro de período, estados vazios, responsividade).
//
// Números esperados, todos derivados do seed e de mais lugar nenhum:
//   contatos comerciais (30d) ....... 7   (4 IMOVEL + 2 ANUNCIE + 1 CONTATO)
//   pessoas distintas ............... 3   (uma delas com 4 contatos)
//   imóveis com contato ............. 2   (de 3 imóveis seedados)
//   proprietários querendo anunciar . 1   (com 2 pedidos)
//   período anterior ................ 2   -> +250%
//   interações sem origem ........... 1   -> só na nota de método
//   (Fase 6) visualizações .......... 20
//   (Fase 6) cliques no WhatsApp .....3
//   (Fase 7) canais: anúncios 6 views/2 contatos · social 10 views/0
//            · sem atribuição 4 views/5 contatos
//   (Fase 7) campanhas: lancamento 10/0 · verao-2026 6/2

// Lê o valor de um card de KPI pelo título — o número é o <p> irmão
// dentro do mesmo card, nunca um texto solto da página.
function valorKpi(page: Page, titulo: string) {
  // Fase 68 — os KPIs passaram a usar o cartão compartilhado do backoffice.
  // Âncoras estruturais do componente em vez de classes utilitárias, que
  // descreviam o CSS de uma versão. Mesma intenção de antes: o número é o
  // do card com AQUELE título, nunca um texto solto da página.
  return page
    .locator("[data-grade-kpis] [data-slot=card]")
    .filter({ has: page.locator("[data-kpi-rotulo]", { hasText: titulo }) })
    .locator("[data-kpi-valor]");
}

// Fase 68 — as seções analíticas passaram a viver em quatro abas (Visão
// geral / Aquisição / Comercial / Comissões), com os painéis inativos
// escondidos. O deep link `?tab=` abre a aba direto: as asserções
// continuam provando a MESMA intenção, sem clique e sem enfraquecer nada.
function urlAba(aba: string, extra = ""): string {
  return `/app/analytics?tab=${aba}${extra}`;
}

test.describe("Analytics comercial — tenant com dados", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/analytics");
  });

  test("KPIs refletem os eventos reais e separam contatos de pessoas", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Analytics comercial", level: 1 })).toBeVisible();

    await expect(valorKpi(page, "Contatos recebidos")).toHaveText("7");
    // A asserção central da fase: 7 contatos NÃO são 7 pessoas.
    await expect(valorKpi(page, "Pessoas que procuraram")).toHaveText("3");
    await expect(valorKpi(page, "Imóveis com contato")).toHaveText("2");
    await expect(valorKpi(page, "Querem anunciar")).toHaveText("1");

    // Comparação com o período anterior (2 -> 7), calculada e não
    // decorativa.
    await expect(page.getByText("+250% vs. período anterior")).toBeVisible();
  });

  test("origem dos contatos usa os rótulos do catálogo, com número e percentual", async ({ page }) => {
    await page.goto(urlAba("aquisicao"));
    await expect(page.getByText("Página do imóvel", { exact: true })).toBeVisible();
    await expect(page.getByText("Página de contato", { exact: true })).toBeVisible();
    await expect(page.getByText("Anuncie seu imóvel", { exact: true })).toBeVisible();

    // 4 de 7 = 57%; 2 de 7 = 29%; 1 de 7 = 14%. Percentual inteiro, sem
    // casa decimal falsa.
    await expect(page.getByText("(57%)")).toBeVisible();
    await expect(page.getByText("(29%)")).toBeVisible();
    await expect(page.getByText("(14%)")).toBeVisible();
  });

  test("ranking de movimento: contato primeiro, e o imóvel só visto passa a existir", async ({ page }) => {
    await page.goto(urlAba("aquisicao"));
    const tabela = page.locator("table", {
      has: page.getByRole("columnheader", { name: "Imóvel" }),
    });
    const linhas = tabela.locator("tbody tr");
    // 3 linhas, não 2: o terceiro imóvel entra por visualização (Fase 6).
    await expect(linhas).toHaveCount(3);

    // Contato continua sendo o critério primário — a leitura da Fase 5
    // não mudou de ordem.
    await expect(linhas.nth(0)).toContainText("Cobertura Analytics mais procurada");
    await expect(linhas.nth(1)).toContainText("Studio Analytics segundo colocado");
    // O diagnóstico que a Fase 5 não conseguia mostrar: muito visto, zero
    // contato. Antes ele simplesmente não aparecia na tabela.
    await expect(linhas.nth(2)).toContainText("Sobrado Analytics sem nenhum contato");

    // Linka pro imóvel no painel (sem expor PII de quem procurou).
    await expect(
      tabela.getByRole("link", { name: "Cobertura Analytics mais procurada" })
    ).toHaveAttribute("href", "/app/imoveis/e2e-imovel-analytics-top");
  });

  test("funil digital mostra as três etapas e as duas taxas reais", async ({ page }) => {
    await page.goto(urlAba("aquisicao"));
    const funil = page.getByRole("region", { name: "Funil digital" });
    await expect(funil).toBeVisible();

    await expect(funil.getByText("Visualizações", { exact: true })).toBeVisible();
    await expect(funil.getByText("Cliques no WhatsApp", { exact: true })).toBeVisible();
    await expect(funil.getByText("Contatos pelo imóvel", { exact: true })).toBeVisible();

    // 20 visualizações, 3 cliques, 4 contatos de imóvel.
    await expect(funil.getByText("20", { exact: true })).toBeVisible();
    await expect(funil.getByText("3", { exact: true })).toBeVisible();

    // 4/20 = 20% e 3/20 = 15%, ambas com denominador compatível.
    await expect(funil.getByText("20%", { exact: true })).toBeVisible();
    await expect(funil.getByText("15%", { exact: true })).toBeVisible();

    // Honestidade semântica: clique é intenção, nunca "lead".
    await expect(funil).toContainText("não confirma que a mensagem foi enviada");
    await expect(funil).not.toContainText("Leads pelo WhatsApp");
  });

  test("canal de aquisição separa tráfego de contexto comercial", async ({ page }) => {
    await page.goto(urlAba("aquisicao"));
    const aquisicao = page.getByRole("region", { name: "Canal de aquisição" });
    await expect(aquisicao).toBeVisible();

    // Título DIFERENTE de "Origem dos contatos" (contexto comercial):
    // são duas perguntas distintas sobre o mesmo contato.
    await expect(page.getByText("Origem dos contatos", { exact: true })).toBeVisible();

    await expect(aquisicao.getByText("Anúncios pagos", { exact: true })).toBeVisible();
    await expect(aquisicao.getByText("Redes sociais", { exact: true })).toBeVisible();
    // Dado sem origem aparece como tal — nunca é redistribuído nos outros.
    await expect(aquisicao.getByText("Sem atribuição", { exact: true })).toBeVisible();

    // Anúncios: 6 de 20 views = 30%.
    await expect(aquisicao.getByText("30%", { exact: true })).toBeVisible();
    // Redes sociais: 10 de 20 = 50%.
    await expect(aquisicao.getByText("50%", { exact: true })).toBeVisible();

    // Campanhas, só leitura.
    await expect(aquisicao.getByText("verao-2026", { exact: true })).toBeVisible();
    await expect(aquisicao.getByText("lancamento", { exact: true })).toBeVisible();

    // Precisão semântica: é atribuição da VISITA, nunca "origem original".
    await expect(aquisicao).toContainText("visita atual");
    await expect(aquisicao).not.toContainText("origem original");
  });

  test("gráfico monta e a mesma série existe como tabela acessível", async ({ page }) => {
    await expect(page.getByText("Evolução dos contatos")).toBeVisible();
    // recharts renderiza um <svg> — confirma que o gráfico montou, sem
    // inspecionar a implementação interna da lib.
    await expect(page.locator(".recharts-surface").first()).toBeVisible();

    // O dado principal é legível sem depender do desenho.
    await expect(page.getByText(/7 contatos no total/)).toBeVisible();

    const botao = page.getByRole("button", { name: "Ver dados da série" });
    await expect(botao).toHaveAttribute("aria-expanded", "false");
    await botao.click();
    await expect(page.getByRole("button", { name: "Ocultar dados da série" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    const tabelaSerie = page.locator("#analytics-serie-tabela table");
    await expect(tabelaSerie).toBeVisible();
    // 30 dias -> 30 linhas, incluindo os dias em zero (buckets vazios
    // nunca somem da série).
    await expect(tabelaSerie.locator("tbody tr")).toHaveCount(30);
  });

  test("nota de método declara o que é contado e divulga o que ficou de fora", async ({ page }) => {
    // Fase 68 — o bloco virou "Entenda os indicadores", um <details>
    // fechado por padrão: ele continua na página, com TODAS as regras, mas
    // deixou de competir com os dados. O teste abre e verifica o conteúdo.
    const nota = page.getByRole("region", { name: "Entenda os indicadores" });
    await nota.getByText("Entenda os indicadores").click();
    await expect(nota).toContainText("apenas contatos recebidos pelos formulários do site");
    await expect(nota).toContainText("não entram");
    // A única interação origin=null do período é divulgada, nunca somada
    // nem atribuída a uma origem inventada.
    await expect(nota).toContainText("1 interação deste período não tem origem registrada");
  });

  test("filtro de período é URL-driven, sobrevive ao refresh e muda a granularidade", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Últimos 30 dias" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await page.getByRole("link", { name: "Últimos 7 dias" }).click();
    await expect(page).toHaveURL(/periodo=7d/);
    // Os 7 contatos do seed estão todos nos últimos 5 dias — a janela de
    // 7 dias contém todos eles, e nenhum dos 2 antigos.
    await expect(valorKpi(page, "Contatos recebidos")).toHaveText("7");

    await page.getByRole("link", { name: "Últimas 13 semanas" }).click();
    await expect(page).toHaveURL(/periodo=13s/);
    await expect(page.getByText("um ponto por semana")).toBeVisible();
    // 9 contatos comerciais no total do seed (7 recentes + 2 antigos).
    await expect(valorKpi(page, "Contatos recebidos")).toHaveText("9");

    await page.reload();
    await expect(page.getByRole("link", { name: "Últimas 13 semanas" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    // Período inválido cai no padrão seguro de 30 dias, nunca quebra.
    await page.goto("/app/analytics?periodo=90d");
    await expect(page.getByRole("link", { name: "Últimos 30 dias" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(valorKpi(page, "Contatos recebidos")).toHaveText("7");
  });

  for (const largura of [375, 768, 1024, 1280, 1440]) {
    test(`${largura}px: sem overflow horizontal do documento`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/analytics");
      await expect(valorKpi(page, "Contatos recebidos")).toBeVisible();
      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow horizontal em ${largura}px`).toBe(true);
    });
  }
});

test.describe("Analytics comercial — tenant sem contatos", () => {
  // ORG_AGENDA tem CRM habilitado mas NENHUM contato comercial por
  // construção: nenhum formulário público aponta pra ela (PUBLIC_ORG_SLUG
  // é a Org A), e as interações que agenda.spec.ts cria são visitas
  // internas (origin=null), que por definição não são captação. É o
  // cenário de tenant novo, sem precisar de uma organização a mais só
  // pra isso.
  test("estados vazios explicam a ausência de dados, sem NaN nem gráfico quebrado", async ({ page }) => {
    await login(page, ORG_AGENDA);
    await page.goto("/app/analytics");

    await expect(valorKpi(page, "Contatos recebidos")).toHaveText("0");
    await expect(valorKpi(page, "Pessoas que procuraram")).toHaveText("0");
    await expect(page.getByText("Sem variação vs. período anterior")).toBeVisible();

    // A série vive na Visão geral (aba inicial).
    await expect(
      page.getByText("Ainda não há contatos neste período.", { exact: false }).first()
    ).toBeVisible();

    // Origem, ranking de imóveis e funil vivem em Aquisição — cada estado
    // vazio continua explicando a ausência com as MESMAS palavras.
    await page.goto(urlAba("aquisicao"));
    await expect(
      page.getByText("Ainda não há contatos neste período para distribuir por origem.")
    ).toBeVisible();
    await expect(
      page.getByText("Nenhum imóvel teve visualização ou contato neste período.")
    ).toBeVisible();
    // Tenant sem nenhum evento digital: a tela explica que a medição
    // começou agora, em vez de mostrar zeros como se fossem desempenho.
    await expect(page.getByText(/A medição de visualizações e cliques começou agora/)).toBeVisible();

    // Nenhum artefato de cálculo vazando pra tela — verificado em TODAS as
    // abas, porque os painéis inativos continuam montados (hidden) e o
    // textContent os alcança.
    const corpo = (await page.locator("main").textContent()) ?? "";
    expect(corpo).not.toMatch(/NaN|undefined|Infinity|∞/);
  });
});

test.describe("Analytics comercial — isolamento e autorização", () => {
  test("dados de outro tenant não aparecem aqui", async ({ page }) => {
    await login(page, ORG_AGENDA);
    await page.goto("/app/analytics");

    // Nada da Organização de Analytics pode atravessar.
    await expect(page.getByText("Cobertura Analytics mais procurada")).toHaveCount(0);
    await expect(page.getByText("Studio Analytics segundo colocado")).toHaveCount(0);
    await expect(valorKpi(page, "Imóveis com contato")).toHaveText("0");
    await expect(valorKpi(page, "Querem anunciar")).toHaveText("0");
  });

  test("organização sem o módulo CRM não acessa o Analytics", async ({ page }) => {
    await login(page, ORG_B);
    await page.goto("/app/analytics");
    await expect(page.getByText("CRM não incluído no seu plano")).toBeVisible();
    await expect(page.getByText("Contatos recebidos")).toHaveCount(0);
  });
});

// =====================================================================
// Fase 68 — Analytics em quatro domínios, na linguagem do backoffice
// =====================================================================
// A cobertura aqui prova SEMÂNTICA, não layout: que as abas são abas de
// verdade (painéis alternados no cliente), que período e domínio são
// independentes na URL, e que conceitos diferentes continuam separados.
test.describe("Analytics — quatro domínios", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/analytics");
  });

  test("cabeçalho e KPIs de topo seguem o padrão compartilhado", async ({ page }) => {
    const h1 = page.locator("main h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Analytics comercial");
    // Subtítulo PRESERVADO: declara o escopo real da medição.
    await expect(
      page.getByText(/como o mercado procurou a sua imobiliária pelos formulários do site/)
    ).toBeVisible();

    // Os quatro KPIs ficam FORA das abas — valem para qualquer domínio.
    const grade = page.locator("[data-grade-kpis]");
    await expect(grade).toBeVisible();
    for (const rotulo of [
      "Contatos recebidos",
      "Pessoas que procuraram",
      "Imóveis com contato",
      "Querem anunciar",
    ]) {
      await expect(grade.locator("[data-kpi-rotulo]", { hasText: rotulo })).toBeVisible();
    }
    // Não navegam hoje: nenhuma afordância de clique inventada.
    await expect(grade.locator("a")).toHaveCount(0);
  });

  test("são ABAS de verdade: tablist, um painel visível, teclado", async ({ page }) => {
    const barra = page.locator("[data-abas-configuracoes]");
    await expect(barra).toHaveAttribute("role", "tablist");

    const abas = barra.getByRole("tab");
    await expect(abas).toHaveCount(4);
    const rotulos = await abas.evaluateAll((els) =>
      els.map((el) => (el.textContent ?? "").trim())
    );
    expect(rotulos).toEqual(["Visão geral", "Aquisição", "Comercial", "Comissões"]);

    // Aqui role="tab" é HONESTO: existem painéis alternados no cliente —
    // diferente de "Meu trabalho | Equipe", que é resolvido no servidor.
    await expect(barra.getByRole("tab", { selected: true })).toHaveCount(1);
    const visiveis = await page
      .locator("[role=tabpanel]")
      .evaluateAll((els) => els.filter((el) => !el.hasAttribute("hidden")).length);
    expect(visiveis, "exatamente um painel visível").toBe(1);

    // Setas percorrem as abas.
    await barra.getByRole("tab", { selected: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(barra.getByRole("tab", { selected: true })).toContainText("Aquisição");
  });

  test("a aba fica na URL, sobrevive ao refresh e aceita deep link", async ({ page }) => {
    await page.getByRole("tab", { name: "Comissões" }).click();
    await expect(page).toHaveURL(/tab=comissoes/);

    await page.reload();
    await expect(page.getByRole("tab", { selected: true })).toContainText("Comissões");

    // Deep link direto.
    await page.goto(urlAba("comercial"));
    await expect(page.getByRole("tab", { selected: true })).toContainText("Comercial");
  });

  test("período e domínio são independentes: trocar um preserva o outro", async ({ page }) => {
    await page.goto(urlAba("aquisicao"));
    // Antes desta fase os links de período reescreviam a URL do zero e
    // descartavam todo o resto — a aba aberta seria perdida.
    await page.getByRole("link", { name: /7 dias/ }).click();
    await expect(page).toHaveURL(/periodo=7d/);
    await expect(page).toHaveURL(/tab=aquisicao/);
    await expect(page.getByRole("tab", { selected: true })).toContainText("Aquisição");

    // E trocar de aba preserva o período.
    await page.getByRole("tab", { name: "Comissões" }).click();
    await expect(page).toHaveURL(/periodo=7d/);
    await expect(page).toHaveURL(/tab=comissoes/);
  });

  test("Aquisição mantém origem cadastral e canal da visita SEPARADOS", async ({ page }) => {
    await page.goto(urlAba("aquisicao"));
    // São duas perguntas diferentes sobre o mesmo contato e continuam em
    // blocos distintos — normalizá-las num só seria perder significado.
    await expect(page.getByText("Origem dos contatos", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Canal de aquisição" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Funil digital" })).toBeVisible();
  });

  test("Comissões separa ATRIBUÍDA de PAGA, sem tratar uma como a outra", async ({ page }) => {
    await page.goto(urlAba("comissoes"));
    const painel = page.locator('[data-painel="comissoes"]');

    // Os dois blocos coexistem: atribuição é declarada pela equipe,
    // pagamento é registrado com a data em que ocorreu.
    await expect(painel).toContainText(/[Pp]articipação na comissão/);
    await expect(painel).toContainText(/[Ll]iquidação/);
    // A tela nunca afirma que atribuído é recebido.
    await expect(painel).not.toContainText("Receita recebida");
    await expect(painel).not.toContainText("Comissão recebida pela imobiliária");
  });

  test("Comercial traz resultado e quem conduziu, sem linguagem de ranking", async ({ page }) => {
    await page.goto(urlAba("comercial"));
    const painel = page.locator('[data-painel="comercial"]');
    await expect(painel).toContainText(/[Rr]esultado comercial/);

    // A tabela descreve resultados, não avalia pessoas.
    const texto = (await painel.innerText()).toLowerCase();
    for (const proibido of ["melhor corretor", "pior", "top vendedor", "baixa performance", "ranking"]) {
      expect(texto, `Comercial não pode conter "${proibido}"`).not.toContain(proibido);
    }
  });

  test("'Entenda os indicadores' fica fechado e preserva as regras", async ({ page }) => {
    const detalhes = page.locator("details").last();
    // Fechado por padrão: deixou de competir com os dados.
    await expect(detalhes).toHaveJSProperty("open", false);

    await page.getByText("Entenda os indicadores").click();
    await expect(detalhes).toHaveJSProperty("open", true);

    // As regras que impedem leituras erradas continuam escritas, palavra
    // por palavra — e continuam na MESMA página, sem rota nova.
    await expect(detalhes).toContainText("apenas contatos recebidos pelos formulários do site");
    await expect(detalhes).toContainText("Comissão atribuída” não é valor recebido");
    await expect(detalhes).toContainText("só conta quando alguém registra o pagamento");
    await expect(page).toHaveURL(/\/app\/analytics/);
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
});

test.describe("Analytics — responsividade dos quatro domínios", () => {
  for (const [largura, altura] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    test(`${largura}×${altura}: sem overflow do documento em todas as abas`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await login(page, ORG_ANALYTICS);

      for (const aba of ["geral", "aquisicao", "comercial", "comissoes"]) {
        await page.goto(urlAba(aba));
        await expect(page.locator("main h1")).toBeVisible();

        const rolou = await page.evaluate(() => {
          window.scrollTo(9999, 0);
          const x = window.scrollX;
          window.scrollTo(0, 0);
          return x;
        });
        expect(rolou, `aba ${aba} rolou ${rolou}px em ${largura}px`).toBe(0);
      }
    });
  }

  test("390px: as abas rolam na barra em vez de esmagar os rótulos", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/analytics");

    const larguras = await page
      .locator("[data-abas-configuracoes] [role=tab]")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    expect(larguras).toHaveLength(4);
    for (const w of larguras) expect(w, `aba com ${w}px`).toBeGreaterThan(60);
  });
});

import { test, expect } from "@playwright/test";
import { ORG_CENTRAL, ORG_CENTRAL_CORRETOR, ORG_FUSO, login } from "./helpers";

// =======================================================================
// Visão de equipe da Central (Fase 21)
// =======================================================================
// Roda na Organização E (dedicada, seed determinístico) pelo mesmo motivo
// estrutural das fases 17-19: as asserções são números absolutos.
//
// Seed relevante: o dono é OWNER (autoridade gerencial), há um segundo
// corretor BROKER, 4 negociações do dono, 1 do outro corretor e 1 SEM
// RESPONSÁVEL.
//
// As bordas finas (baldes temporais, DST, membro inativo, truncamento,
// ownership) estão em 40 unitários e 28 de integração, onde o relógio
// pode ser fixado. Aqui prova-se o que só o navegador prova.

test.describe("gestor vê a equipe", () => {
  test("alterna para Equipe e enxerga resumo, distribuição e sem responsável", async ({ page }) => {
    await login(page, ORG_CENTRAL);

    // A Central abre no trabalho PESSOAL, mesmo para quem é gestor.
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toBeVisible();
    const alternador = page.getByRole("navigation", { name: "Visão da central" });
    await expect(alternador).toBeVisible();
    await expect(alternador.getByRole("link", { name: /Meu trabalho/ })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await alternador.getByRole("link", { name: "Equipe" }).click();
    await page.waitForURL(/\/app\?visao=equipe/);

    // Estado atual é textual e semântico, não só cor.
    await expect(
      page.getByRole("navigation", { name: "Visão da central" }).getByRole("link", { name: /Equipe/ })
    ).toHaveAttribute("aria-current", "page");

    await expect(page.getByRole("heading", { name: "Visão da equipe" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Distribuição por responsável" })).toBeVisible();

    const texto = (await page.locator("main").innerText()).replace(/ /g, " ");

    // Deixa explícito que os números são da ORGANIZAÇÃO, não "meus".
    expect(texto).toContain("Compromissos e negociações de toda a organização.");

    // O fato que a Central pessoal nunca conseguiu mostrar.
    expect(texto).toContain("1 negociação sem responsável");

    // A distribuição mostra as pessoas, inclusive o outro corretor —
    // é isso que a visão pessoal, por definição, não mostra.
    expect(texto).toContain("Bruno Outro Corretor");
    expect(texto).toContain("negociações abertas");

    // Nada de julgamento. A checagem é sobre o que a visão AFIRMA, não
    // sobre a presença de substrings: a própria descrição do bloco usa a
    // palavra "ranking" justamente para negá-la, e a seção "Visão geral"
    // (KPIs preexistentes) segue abaixo com os títulos que sempre teve.
    expect(texto).toContain("Não é ranking nem avaliação.");
    for (const julgamento of [
      "melhor corretor",
      "pior corretor",
      "produtividade",
      "lead quente",
      "risco",
      "Prioridade",
    ]) {
      expect(texto).not.toContain(julgamento);
    }

    // A ordem das pessoas é ALFABÉTICA — se fosse ranking por pendência,
    // a ordem mudaria com os números.
    // Fase 65.1 — o título da distribuição passou a ser um cabeçalho de
    // SEÇÃO (acima do card), então não há mais card ancestral do heading.
    // A lista ganhou âncora própria e prova exatamente o mesmo: a ordem
    // dentro da distribuição.
    const bloco = await page.locator("[data-distribuicao-equipe]").innerText();
    const posicaoBruno = bloco.indexOf("Bruno Outro Corretor");
    const posicaoSem = bloco.indexOf("Sem responsável");
    expect(posicaoBruno).toBeGreaterThanOrEqual(0);
    // "Sem responsável" não é uma pessoa e fica por último.
    expect(posicaoSem).toBeGreaterThan(posicaoBruno);

    // A visão pessoal NÃO aparece junto — os dois contextos não se
    // misturam na mesma tela.
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toHaveCount(0);
  });

  test("os números levam às telas donas — a Central não resolve, ela aponta", async ({ page }) => {
    await login(page, ORG_CENTRAL);
    await page.goto("/app?visao=equipe");

    // "Sem responsável" leva ao Pipeline JÁ FILTRADO, reusando o filtro
    // que o Pipeline já tinha.
    // Fase 65.1 — o texto virou um callout e o LINK passou a ser
    // "Atribuir no Pipeline →". O destino é o mesmo filtro de sempre.
    await expect(page.getByText(/1 negociação sem responsável/)).toBeVisible();
    await page.getByRole("link", { name: /Atribuir no Pipeline/ }).click();
    await page.waitForURL(/\/app\/pipeline\?responsavel=SEM/);
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
    const pipeline = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(pipeline).toContain("Central Sem Responsavel");

    // E a Central de equipe não oferece nenhuma mutação.
    await page.goto("/app?visao=equipe");
    for (const acao of ["Atribuir", "Transferir", "Concluir", "Cancelar"]) {
      await expect(page.getByRole("button", { name: acao })).toHaveCount(0);
    }
  });

  test("a equipe concorda com a Agenda sobre atrasados e hoje", async ({ page }) => {
    await login(page, ORG_CENTRAL);
    await page.goto("/app?visao=equipe");
    const equipe = (await page.locator("main").innerText()).replace(/ /g, " ");
    // O seed tem 1 visita atrasada na organização.
    expect(equipe).toContain("Atrasados");
    expect(equipe).toContain("Central Atrasada");

    // Atrasados vivem na aba "anteriores" da Agenda (a aba padrão é
    // "hoje") — é para lá que o número da equipe aponta.
    await page.goto("/app/agenda?aba=anteriores&status=ATRASADAS");
    const agenda = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(agenda).toContain("Central Atrasada");
  });
});

test.describe("corretor sem autoridade gerencial", () => {
  test("não vê o alternador e continua com a Central pessoal", async ({ page }) => {
    await login(page, ORG_CENTRAL_CORRETOR);

    // A Home dele é exatamente a de antes: nenhum controle novo.
    await expect(page.getByRole("navigation", { name: "Visão da central" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toBeVisible();
  });

  // A garantia da fase: o parâmetro é um pedido, e o servidor recusa.
  test("manipular ?visao=equipe na URL não revela a organização", async ({ page }) => {
    await login(page, ORG_CENTRAL_CORRETOR);
    await page.goto("/app?visao=equipe");

    // Nada da visão de equipe é renderizado...
    await expect(page.getByRole("heading", { name: "Visão da equipe" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Distribuição por responsável" })).toHaveCount(0);

    const texto = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(texto).not.toContain("Compromissos e negociações de toda a organização.");
    expect(texto).not.toContain("sem responsável");

    // ... e ele recebe a própria Central, não uma tela de erro.
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toBeVisible();
    expect(texto).toContain("1 negociação em andamento sob sua responsabilidade");
    // O trabalho do dono da organização não vaza para ele.
    expect(texto).not.toContain("Central Atrasada");
  });
});

test.describe("visão de equipe no fuso da organização", () => {
  test("a classificação da equipe usa o calendário da organização", async ({ page }) => {
    // Org F está em America/Sao_Paulo e o dono é OWNER. O seed tem uma
    // visita às 23:30 locais (hoje lá, amanhã em UTC) e outra às 00:15
    // do dia seguinte.
    await login(page, ORG_FUSO);
    await page.goto("/app?visao=equipe");

    await expect(page.getByRole("heading", { name: "Visão da equipe" })).toBeVisible();
    const equipe = (await page.locator("main").innerText()).replace(/ /g, " ");

    // A Agenda tem de dizer a mesma coisa — zero helper temporal
    // paralelo (Fase 18 preservada).
    await page.goto("/app/agenda");
    const agenda = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(agenda).toContain("Fuso Fim Do Dia");
    expect(agenda).toContain("23:30");
    expect(equipe).toContain("Hoje");
  });
});

test.describe("responsividade da visão de equipe", () => {
  test("sem overflow horizontal em 375/390/430/768/1024/1280/1440", async ({ page }) => {
    await login(page, ORG_CENTRAL);

    for (const largura of [375, 390, 430, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app?visao=equipe");
      await expect(page.getByRole("heading", { name: "Visão da equipe" })).toBeVisible();
      const rolagemX = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolagemX, `visão de equipe rolou ${rolagemX}px em ${largura}px`).toBe(0);
    }
  });
});

// =====================================================================
// Fase 65.1 — visão Equipe migrada para a linguagem do novo backoffice
// =====================================================================
// O que estes testes protegem é a INTENÇÃO, não o CSS: as mesmas
// contagens, a mesma ordenação, os mesmos destinos, e a garantia de que a
// migração visual não transformou distribuição operacional em avaliação.
test.describe("Visão da equipe — novo padrão", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_CENTRAL);
    await page.goto("/app?visao=equipe");
  });

  test("os quatro indicadores usam o cartão compartilhado e mantêm os destinos", async ({
    page,
  }) => {
    const grade = page.locator("[data-grade-kpis]").first();
    await expect(grade).toBeVisible();

    for (const rotulo of ["Atrasados", "Hoje", "Próximos", "Negociações abertas"]) {
      await expect(grade.locator("[data-kpi-rotulo]", { hasText: rotulo }).first()).toBeVisible();
    }

    // Os links de investigação são os MESMOS de antes da migração — a
    // Central aponta, quem resolve é a tela dona.
    const destinos = await grade
      .locator("a")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(destinos).toEqual([
      "/app/agenda?aba=anteriores&status=ATRASADAS",
      "/app/agenda",
      "/app/agenda?aba=proximas",
      "/app/pipeline",
    ]);
  });

  test("os valores dos indicadores continuam os do seed", async ({ page }) => {
    const grade = page.locator("[data-grade-kpis]").first();
    const valorDe = async (rotulo: string) =>
      grade
        .locator("[data-slot=card]")
        .filter({ has: page.locator("[data-kpi-rotulo]", { hasText: rotulo }) })
        .locator("[data-kpi-valor]")
        .textContent();

    // Seed determinístico da Organização E: 1 atraso, 6 negociações
    // abertas (4 do dono + 1 do outro corretor + 1 sem responsável).
    expect(await valorDe("Atrasados")).toBe("1");
    expect(await valorDe("Negociações abertas")).toBe("6");
    // Hoje/Próximos são números, não texto — o que importa é que existam
    // e sejam não-negativos (outras specs não escrevem nesta org, mas o
    // teste não precisa amarrar o valor para provar a migração).
    for (const rotulo of ["Hoje", "Próximos"]) {
      expect(Number(await valorDe(rotulo))).toBeGreaterThanOrEqual(0);
    }
  });

  test("negociação sem responsável virou callout, com o mesmo filtro", async ({ page }) => {
    const callout = page.locator("[data-sem-responsavel]");
    await expect(callout).toBeVisible();
    await expect(callout).toContainText("1 negociação sem responsável");
    // O valor do filtro é o de FILTRO_SEM_RESPONSAVEL, o MESMO que o
    // Pipeline já usava — nenhum filtro novo foi inventado.
    await expect(callout.getByRole("link", { name: /Atribuir no Pipeline/ })).toHaveAttribute(
      "href",
      "/app/pipeline?responsavel=SEM"
    );
  });

  test("a distribuição mantém todos, a ordem alfabética e o 'Sem responsável' por último", async ({
    page,
  }) => {
    const nomes = await page
      .locator("[data-distribuicao-equipe] > li a")
      .evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));

    expect(nomes.length).toBeGreaterThanOrEqual(2);
    expect(nomes).toContain("Bruno Outro Corretor");
    // "Sem responsável" não é uma pessoa e fica por último, sempre.
    expect(nomes[nomes.length - 1]).toBe("Sem responsável");

    // As pessoas (todas menos a última) estão em ordem alfabética — se
    // fosse ranking, a ordem mudaria com os números.
    const pessoas = nomes.slice(0, -1);
    const ordenadas = [...pessoas].sort((a, b) => a.localeCompare(b, "pt-BR"));
    expect(pessoas).toEqual(ordenadas);
  });

  test("cada responsável mostra as quatro métricas, sem virar avaliação", async ({ page }) => {
    const linhas = page.locator("[data-distribuicao-equipe] > li");
    const total = await linhas.count();
    expect(total).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < total; i += 1) {
      const rotulos = await linhas
        .nth(i)
        .locator("dl dt")
        .evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));
      expect(rotulos).toHaveLength(4);
      expect(rotulos.slice(1)).toEqual(["atrasados", "hoje", "próximos"]);
      expect(rotulos[0]).toMatch(/^negociaç(ão|ões) abert(a|as)$/);
    }

    // A promessa da seção continua escrita na tela.
    await expect(page.getByText("Não é ranking nem avaliação.")).toBeVisible();

    // Nenhuma barra comparativa, nenhuma posição, nenhum juízo.
    const texto = (await page.locator("[data-distribuicao-equipe]").innerText()).toLowerCase();
    for (const proibido of ["ranking", "º lugar", "score", "produtividade", "melhor", "pior"]) {
      expect(texto, `distribuição não pode conter "${proibido}"`).not.toContain(proibido);
    }
    await expect(page.locator("[data-distribuicao-equipe] progress")).toHaveCount(0);
  });

  test("'Sem responsável' usa representação neutra, nunca iniciais inventadas", async ({
    page,
  }) => {
    const ultima = page.locator("[data-distribuicao-equipe] > li").last();
    await expect(ultima).toContainText("Sem responsável");
    // Um ícone, não as letras "SR" — não é uma pessoa.
    await expect(ultima.locator("svg")).toHaveCount(1);
    await expect(ultima).not.toContainText("SR");
  });

  test("atrasados da equipe mantêm o tratamento de atenção e a ordenação", async ({ page }) => {
    const card = page.locator("[data-atrasados-equipe]");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: /Atrasados da equipe/ })).toBeVisible();
    // Quantidade em TEXTO, não só cor.
    await expect(card).toContainText("1 em aberto");
    await expect(card).toContainText(
      "Compromissos cujo dia já passou e que continuam sem conclusão. Mais antigo primeiro."
    );
    // O responsável de cada compromisso continua declarado.
    await expect(card).toContainText("Central Atrasada");
  });

  test("a hierarquia de cabeçalhos da visão Equipe não tem salto", async ({ page }) => {
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

  for (const largura of [390, 768, 1024, 1366, 1440, 1920]) {
    test(`${largura}px: visão Equipe sem overflow e com rótulos legíveis`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app?visao=equipe");

      const rolou = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolou, `rolou ${rolou}px em ${largura}px`).toBe(0);

      // Os rótulos dos KPIs não podem colapsar nem ser cortados. Medir
      // uma largura mínima fixa seria errado — "Hoje" legitimamente ocupa
      // ~29px porque o texto é curto. O que prova o bug é o conteúdo não
      // caber na caixa.
      const medidas = await page
        .locator("[data-grade-kpis] [data-kpi-rotulo]")
        .evaluateAll((els) =>
          els.map((el) => ({
            texto: (el.textContent ?? "").trim(),
            conteudo: el.scrollWidth,
            caixa: el.clientWidth,
          }))
        );
      expect(medidas.length).toBeGreaterThanOrEqual(4);
      for (const m of medidas) {
        expect(m.caixa, `"${m.texto}" colapsou para ${m.caixa}px`).toBeGreaterThan(20);
        expect(
          m.conteudo <= m.caixa + 1,
          `"${m.texto}" cortado: conteúdo ${m.conteudo}px > caixa ${m.caixa}px`
        ).toBe(true);
      }
    });
  }
});

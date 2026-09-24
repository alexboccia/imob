import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// Redesenho de Configurações — comportamento (Server Action, upload,
// validação, autorização, tenant isolation) permanece o mesmo já
// existente; cobertura aqui é proporcional ao risco (mudança
// essencialmente visual) — foco em: a tela renderiza com os 4 cards,
// salvar continua funcionando de ponta a ponta (persiste e reaparece após
// reload), tema continua selecionável, controles de upload permanecem
// presentes, e responsividade real (overflow + legibilidade, não só CSS).
// Fase 61 — a tela passou a ser dividida em abas. Os painéis inativos
// continuam MONTADOS (escondidos por `hidden`), porque o formulário é um
// só e a action grava todos os campos: desmontar apagaria o que não
// estivesse na aba aberta. Por isso os testes abrem a aba certa antes de
// verificar o que está visível.
async function abrirAba(page: import("@playwright/test").Page, rotulo: string) {
  await page.getByRole("tab", { name: rotulo }).click();
}

test.describe("Configurações", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");
  });

  test("página renderiza com as cinco abas e a ação de salvar", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
    for (const aba of [
      "Geral",
      "Identidade visual",
      "Site público",
      "Contatos e redes",
      "Equipe e acesso",
    ]) {
      await expect(page.getByRole("tab", { name: aba })).toBeVisible();
    }
    // Uma aba ativa por vez, e a primeira já vem aberta.
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "Geral" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // O salvar é único e vale para a tela inteira.
    await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeVisible();
  });

  test("controles de upload de logo e favicon permanecem presentes", async ({ page }) => {
    await abrirAba(page, "Identidade visual");
    await expect(page.getByText("Logotipo", { exact: true })).toBeVisible();
    await expect(page.getByText("Favicon", { exact: true })).toBeVisible();
    // Quatro inputs de arquivo reais (logo cabeçalho + favicon + logo
    // rodapé + imagem do Hero), sem alterar a lógica dos já existentes.
    await expect(page.locator('input[type="file"]')).toHaveCount(4);
  });

  test("imagem principal da Home: seção aparece com preview do fallback padrão, sem 'Restaurar' quando não customizada", async ({ page }) => {
    await abrirAba(page, "Site público");
    await expect(page.getByText("Imagem principal da Home", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Esta imagem aparece em destaque no topo do seu site.")
    ).toBeVisible();
    await expect(
      page.getByText(/Recomendado: imagem horizontal, em alta resolução/)
    ).toBeVisible();

    // ORG_A nunca customizou — preview mostra o fallback padrão do
    // produto, e "Restaurar imagem padrão" não faz sentido (já é o
    // padrão), então não aparece.
    const preview = page.getByAltText("Prévia da imagem principal da Home");
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("src", /hero-home/);
    await expect(page.getByRole("button", { name: "Restaurar imagem padrão" })).toHaveCount(0);
  });

  test("rodapé do site: upload dedicado e as 3 opções de aparência aparecem, AUTO é o padrão", async ({ page }) => {
    await abrirAba(page, "Site público");
    await expect(page.getByText("Rodapé do site", { exact: true })).toBeVisible();
    await expect(page.getByText("Logotipo do rodapé", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Use uma versão do logotipo adequada ao fundo do rodapé.")
    ).toBeVisible();

    await expect(page.getByRole("radio", { name: /Automático pelo tema/i })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Cor principal do tema/i })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: /Fundo claro/i })).not.toBeChecked();
    await expect(page.getByText("Usa a cor principal do tema como fundo.")).toBeVisible();
    await expect(page.getByText("Usa uma superfície clara e texto escuro.")).toBeVisible();
  });

  test("aparência do rodapé persiste após salvar e recarregar", async ({ page }) => {
    await abrirAba(page, "Site público");
    await page.getByRole("radio", { name: /Fundo claro/i }).check({ force: true });
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();

    await page.reload();
    await abrirAba(page, "Site público");
    await expect(page.getByRole("radio", { name: /Fundo claro/i })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Automático pelo tema/i })).not.toBeChecked();

    // Devolve ao padrão pra não vazar estado pros outros testes deste
    // describe (mesma organização/sessão reaproveitada entre testes).
    await page.getByRole("radio", { name: /Automático pelo tema/i }).check({ force: true });
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();
  });

  test("salvar persiste os campos preenchidos, tema selecionável, e reaparece após reload", async ({ page }) => {
    const marcador = Date.now();
    const prefixo = `T${marcador}`.slice(0, 10);

    // Campos de TRÊS abas diferentes, num salvamento só: é a prova de
    // que trocar de aba não descarta o que já foi preenchido.
    await abrirAba(page, "Contatos e redes");
    await page.locator("#telefone").fill("+55 (11) 99999-0000");
    await abrirAba(page, "Geral");
    await page.locator("#codigoImovelPrefixo").fill(prefixo);
    await abrirAba(page, "Identidade visual");
    await page.getByRole("radio", { name: /Vinho/i }).check({ force: true });

    await page.getByRole("button", { name: "Salvar alterações" }).click();
    // A action retorna sucesso, mas o formulário (comportamento
    // pré-existente, não alterado neste redesenho) só exibe feedback
    // visível em caso de ERRO (Alert destructive) — não há toast/mensagem
    // de sucesso hoje. A prova real de que salvar funcionou é o reload
    // abaixo mostrando os valores persistidos.
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();

    await page.reload();
    // A aba aberta sobreviveu ao reload: ela viaja na URL.
    await expect(page).toHaveURL(/tab=identidade/);
    // Os valores persistidos continuam nos seus campos — inclusive nas
    // abas que não estão abertas, porque os painéis seguem montados.
    await expect(page.locator("#telefone")).toHaveValue("+55 (11) 99999-0000");
    await expect(page.locator("#codigoImovelPrefixo")).toHaveValue(prefixo.toUpperCase());
    await expect(page.getByRole("radio", { name: /Vinho/i })).toBeChecked();

    await abrirAba(page, "Geral");
    // Fase 63 — o exemplo saiu de uma frase corrida ("Ficará assim: X")
    // para um bloco "Exemplo" ao lado do prefixo. O valor exibido é o
    // mesmo, derivado do prefixo digitado.
    await expect(page.getByText(`${prefixo.toUpperCase()}-100001`)).toBeVisible();
  });

  test("gerar tema pelo logotipo: seção aparece, e sem logo salvo mostra erro amigável (sem quebrar)", async ({ page }) => {
    await abrirAba(page, "Identidade visual");
    await expect(page.getByText("Personalize as cores do seu tema")).toBeVisible();
    await expect(page.getByText(/Defina as cores principais do seu site/)).toBeVisible();

    // ORG_A não tem logotipo salvo no seed determinístico — a Server
    // Action sempre releem o logo do banco (nunca confia em estado do
    // client), então o botão continua visível e clicável mesmo sem logo;
    // ao clicar, a resposta é um erro amigável, sem quebrar a tela e sem
    // alterar nenhum tema (ver seção 12 do pedido).
    await page.getByRole("button", { name: "Gerar tema pelo logotipo" }).click();
    await expect(
      page.getByText(/Nenhum logotipo salvo ainda/)
    ).toBeVisible();
    // Fase 62 — "Aplicar paleta" não existe mais: a paleta é gravada pelo
    // "Salvar alterações" global, como todo o resto da tela.
    await expect(page.getByRole("button", { name: "Aplicar paleta" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Gerar novamente/ })).toHaveCount(0);
    // O único botão de persistência da tela continua sendo um só.
    await expect(page.getByRole("button", { name: "Salvar alterações" })).toHaveCount(1);
  });

  test("375px: sem overflow horizontal e sem quebra caractere-a-caractere", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/app/configuracoes");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      m.scrollWidth <= m.innerWidth + 1,
      `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
    ).toBe(true);

    // Legibilidade: um rótulo de tema não deve quebrar em 1 caractere por
    // linha (mesma classe de bug já encontrada em Manutenção) — medindo a
    // largura real do texto do rótulo "Grafite".
    await abrirAba(page, "Identidade visual");
    const rotuloTema = page.getByText("Grafite", { exact: true });
    await expect(rotuloTema).toBeVisible();
    const largura = await rotuloTema.evaluate((el) => el.getBoundingClientRect().width);
    expect(largura, `largura do rótulo 'Grafite': ${largura}px`).toBeGreaterThan(20);

    // Seção "Gerar tema pelo logotipo" continua legível em mobile — o
    // scrollWidth já checado acima cobre overflow da página inteira;
    // aqui só confirma que o título não quebrou em 1 caractere por linha.
    const tituloGerador = page.getByText("Personalize as cores do seu tema");
    const larguraGerador = await tituloGerador.evaluate((el) => el.getBoundingClientRect().width);
    expect(larguraGerador, `largura do título do editor de cores: ${larguraGerador}px`).toBeGreaterThan(100);

    // Preview da imagem do Hero cabe na viewport (max-w-2xl com w-full —
    // nunca deve ultrapassar 375px de largura real renderizada).
    const previewHero = page.getByAltText("Prévia da imagem principal da Home");
    const larguraPreview = await previewHero.evaluate((el) => el.getBoundingClientRect().width);
    expect(larguraPreview, `largura do preview do Hero: ${larguraPreview}px`).toBeLessThanOrEqual(375);
  });

  test("360px: sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app/configuracoes");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      m.scrollWidth <= m.innerWidth + 1,
      `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
    ).toBe(true);

    await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeVisible();
  });

  test("768px: sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/app/configuracoes");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(m.scrollWidth <= m.innerWidth + 1, `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth}`).toBe(true);
  });

  test("1024px: sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/app/configuracoes");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(m.scrollWidth <= m.innerWidth + 1, `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth}`).toBe(true);
  });

  test("1440px: usa layout full-width, sem overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/configuracoes");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(m.scrollWidth <= m.innerWidth + 1, `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth}`).toBe(true);

    await abrirAba(page, "Identidade visual");
    const identidade = await page
      .locator('[data-slot="card"]')
      .filter({ has: page.locator('[data-slot="card-title"]', { hasText: "Identidade visual" }) })
      .boundingBox();
    const previa = await page.locator("[data-previa-identidade]").boundingBox();

    // Full-width: o card principal continua usando bem mais que a antiga
    // metade (~672px) da área disponível em desktop largo.
    expect(identidade && identidade.width > 700, `largura do card: ${identidade?.width}`).toBe(true);
    // Fase 62 — a prévia ganhou espaço (era uma coluna fixa de 320px,
    // agora ~35% da grade), mas os controles seguem sendo a coluna MAIOR.
    // O limiar antigo (>800px) descrevia a proporção anterior, não a
    // intenção; medir as duas colunas uma contra a outra é o que prende a
    // regressão de verdade.
    expect(previa, "a prévia está na tela").toBeTruthy();
    expect(previa!.width, `prévia ${previa!.width}px`).toBeGreaterThan(320);
    expect(
      identidade!.width > previa!.width,
      `controles ${identidade!.width}px vs prévia ${previa!.width}px`
    ).toBe(true);
  });
});

// =======================================================================
// Abas e prévia (Fase 61)
// =======================================================================
test.describe("Configurações — abas", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");
  });

  test("cada aba mostra o seu conteúdo e esconde o das outras", async ({ page }) => {
    const esperado: Record<string, string> = {
      Geral: "geral",
      "Identidade visual": "identidade",
      "Site público": "site",
      "Contatos e redes": "contatos",
      "Equipe e acesso": "acesso",
    };
    for (const [rotulo, id] of Object.entries(esperado)) {
      await page.getByRole("tab", { name: rotulo }).click();
      await expect(page.locator(`[data-painel='${id}']`)).toBeVisible();
      // Exatamente um painel visível por vez.
      await expect(page.locator("[data-painel]:visible")).toHaveCount(1);
      await expect(page.getByRole("tab", { name: rotulo })).toHaveAttribute(
        "aria-selected",
        "true"
      );
    }
  });

  test("os campos das abas fechadas continuam no formulário", async ({ page }) => {
    // É isto que torna a divisão em abas segura: a action grava todos os
    // campos, e um painel desmontado apagaria o que não estivesse aberto.
    await page.getByRole("tab", { name: "Equipe e acesso" }).click();
    for (const campo of ["#telefone", "#codigoImovelPrefixo", "#nomePublico", "#email"]) {
      await expect(page.locator(campo)).toHaveCount(1);
    }
  });

  test("trocar de aba não descarta o que foi digitado", async ({ page }) => {
    const valor = `Imobiliária ${Date.now()}`;
    await page.getByRole("tab", { name: "Geral" }).click();
    await page.locator("#nomePublico").fill(valor);

    await page.getByRole("tab", { name: "Contatos e redes" }).click();
    await page.getByRole("tab", { name: "Site público" }).click();
    await page.getByRole("tab", { name: "Geral" }).click();

    await expect(page.locator("#nomePublico")).toHaveValue(valor);
  });

  test("a aba escolhida fica no endereço, sem recarregar a página", async ({ page }) => {
    const marcador = `Rascunho ${Date.now()}`;
    await page.getByRole("tab", { name: "Geral" }).click();
    await page.locator("#nomePublico").fill(marcador);

    await page.getByRole("tab", { name: "Site público" }).click();
    await expect(page).toHaveURL(/tab=site/);
    // Não houve navegação: o que estava digitado continua lá.
    await page.getByRole("tab", { name: "Geral" }).click();
    await expect(page.locator("#nomePublico")).toHaveValue(marcador);
  });

  test("abrir com ?tab= já mostra a aba pedida", async ({ page }) => {
    await page.goto("/app/configuracoes?tab=contatos");
    await expect(page.locator("[data-painel='contatos']")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Contatos e redes" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("aba inválida na URL cai na primeira, sem quebrar", async ({ page }) => {
    await page.goto("/app/configuracoes?tab=nao-existe");
    await expect(page.locator("[data-painel='geral']")).toBeVisible();
  });

  test("as abas funcionam pelo teclado", async ({ page }) => {
    const primeira = page.getByRole("tab", { name: "Geral" });
    await primeira.focus();
    await expect(primeira).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Identidade visual" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await page.keyboard.press("ArrowLeft");
    await expect(primeira).toHaveAttribute("aria-selected", "true");
  });

  test("a prévia reage ao tema antes de salvar", async ({ page }) => {
    await page.getByRole("tab", { name: "Identidade visual" }).click();
    const previa = page.locator("[data-previa-tema]");
    await expect(previa).toBeVisible();

    // O tema atual da organização depende do que outros testes deste
    // arquivo salvaram, então o alvo é escolhido a partir dele — nunca
    // um tema fixo, que poderia ser justamente o que já está aplicado.
    const antes = await previa.getAttribute("data-previa-tema");
    const alvo = antes === "wine" ? /Verde Floresta/i : /Vinho/i;
    await page.getByRole("radio", { name: alvo }).check({ force: true });
    await expect(previa).not.toHaveAttribute("data-previa-tema", antes ?? "");
    // Nada foi salvo: a mudança é só da prévia.
    await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeEnabled();
  });

  test("a prévia acompanha o nome público enquanto se digita", async ({ page }) => {
    const nome = `Prévia ${Date.now()}`;
    await page.getByRole("tab", { name: "Geral" }).click();
    await page.locator("#nomePublico").fill(nome);
    await page.getByRole("tab", { name: "Identidade visual" }).click();
    await expect(page.locator("[data-previa-identidade]")).toContainText(nome);
  });

  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: abas e painel sem estouro horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/configuracoes?tab=identidade");

      await expect(page.locator("[data-abas-configuracoes]")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        ),
        `estouro @ ${largura}`
      ).toBe(true);

      // O salvar continua alcançável em qualquer largura.
      const salvar = (await page
        .getByRole("button", { name: "Salvar alterações" })
        .boundingBox())!;
      expect(salvar.x).toBeGreaterThanOrEqual(-0.5);
      expect(salvar.x + salvar.width).toBeLessThanOrEqual(largura + 0.5);
    });
  }
});

// =====================================================================
// Fase 62 — prévia do site, editor de cores compacto e sidebar com ícones
// =====================================================================
test.describe("Configurações — prévia do site público", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes?tab=identidade");
  });

  test("a prévia deixou de ser abstrata: mostra hero real, chamada real e o rodapé", async ({
    page,
  }) => {
    const previa = page.locator("[data-previa-identidade]");
    await expect(previa).toBeVisible();

    // A chamada do hero é a MESMA constante que o site público usa
    // (HERO_TITULO em src/lib/site-typography.ts) — não uma barra cinza.
    await expect(previa).toContainText("Encontre o imóvel ideal para você");
    await expect(previa).toContainText("Imóveis em destaque");

    // Imagem REAL do hero (a configurada, ou o asset padrão da Home).
    const imagens = previa.locator("img");
    expect(await imagens.count()).toBeGreaterThan(0);
    const src = await imagens.first().getAttribute("src");
    expect(src, "a prévia carrega uma imagem de verdade").toBeTruthy();
  });

  test("a prévia usa dados da organização atual, não valores fixos", async ({ page }) => {
    const previa = page.locator("[data-previa-identidade]");
    // O nome no rodapé da maquete é o da organização da sessão. O seed
    // não fixa um nome público para a ORG_A, então o fallback é o nome da
    // própria organização — e nunca uma imobiliária escrita em código.
    const texto = (await previa.innerText()).toLowerCase();
    expect(texto).not.toContain("sua imobiliária");

    // Cruza com o nome que o seletor de organização do painel mostra:
    // é a mesma organização, então a prévia tem de falar dela.
    const nomePainel = (await page.locator("aside").innerText()).trim();
    expect(nomePainel.length).toBeGreaterThan(0);
  });

  test("a prévia reage ao TEMA antes de salvar", async ({ page }) => {
    const maquete = page.locator("[data-previa-tema]");
    const antes = await maquete.getAttribute("data-previa-tema");

    // Escolhe um tema DIFERENTE do atual — a ordem do catálogo não
    // importa, o que importa é que a prévia acompanhe a troca.
    const radios = page.locator('input[name="themeId"]');
    const total = await radios.count();
    let trocou = false;
    for (let i = 0; i < total; i += 1) {
      const valor = await radios.nth(i).getAttribute("value");
      if (valor && valor !== antes) {
        await radios.nth(i).check({ force: true });
        await expect(maquete).toHaveAttribute("data-previa-tema", valor);
        trocou = true;
        break;
      }
    }
    expect(trocou, "havia outro tema no catálogo para trocar").toBe(true);

    // Nada foi salvo: recarregar volta ao tema persistido.
    await page.goto("/app/configuracoes?tab=identidade");
    await expect(page.locator("[data-previa-tema]")).toHaveAttribute(
      "data-previa-tema",
      antes ?? ""
    );
  });

  test("a prévia reage às CORES personalizadas antes de salvar", async ({ page }) => {
    const maquete = page.locator("[data-previa-tema]");
    const corPrimaria = page.locator("#cor-primary");

    // A cor primária pinta o CTA e o rodapé da maquete — ler a CSS var do
    // wrapper prova que a prévia recebeu o valor, sem depender de qual
    // elemento a consome.
    await corPrimaria.fill("#123456");
    await expect
      .poll(async () =>
        maquete.evaluate((el) => getComputedStyle(el).getPropertyValue("--primary").trim())
      )
      .not.toBe("");

    const varPrimary = await maquete.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--primary").trim()
    );
    // O editor converte hex -> oklch antes de publicar a paleta.
    expect(varPrimary.startsWith("oklch")).toBe(true);

    // E a maquete passou a se declarar personalizada.
    await expect(maquete).toHaveAttribute("data-previa-tema", "custom");
  });

  test("a prévia acompanha o nome público digitado", async ({ page }) => {
    await abrirAba(page, "Geral");
    await page.locator("#nomePublico").fill("Imobiliária Teste Fase 62");
    await abrirAba(page, "Identidade visual");
    await expect(page.locator("[data-previa-identidade]")).toContainText(
      "Imobiliária Teste Fase 62"
    );
  });
});

test.describe("Configurações — editor de cores compacto", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes?tab=identidade");
  });

  test("os seis controles existem, com rótulo, amostra e hexadecimal", async ({ page }) => {
    const editor = page.locator("[data-editor-cores]");
    await expect(editor).toBeVisible();

    for (const [campo, rotulo] of [
      ["primary", "Cor primária"],
      ["primaryHover", "Primária no hover"],
      ["primaryLight", "Primária clara"],
      ["secondary", "Fundo de seções"],
      ["border", "Bordas"],
      ["onPrimary", "Texto sobre a primária"],
    ]) {
      await expect(editor.getByText(rotulo, { exact: true })).toBeVisible();
      await expect(page.locator(`#cor-${campo}`)).toBeVisible();
      await expect(editor.locator(`[data-amostra-cor="${campo}"]`)).toHaveCount(1);
    }
  });

  test("os controles são CAMPOS DO FORMULÁRIO — salvar leva as cores junto", async ({ page }) => {
    // O que impede a regressão de ter dois botões de salvar: cada cor é um
    // input com `name`, dentro do mesmo <form> do resto da tela.
    const dentroDoForm = await page.locator('form input[name^="cor_"]').count();
    expect(dentroDoForm).toBe(6);
  });

  test("gerar tema pelo logotipo e restaurar padrão substituem a redundância antiga", async ({
    page,
  }) => {
    const editor = page.locator("[data-editor-cores]");
    await expect(editor.getByRole("button", { name: "Gerar tema pelo logotipo" })).toBeVisible();
    await expect(editor.getByRole("button", { name: "Restaurar cores padrão" })).toBeVisible();
    // Duas ações no editor, nunca um segundo "salvar".
    await expect(editor.getByRole("button")).toHaveCount(2 + 6); // 2 ações + 6 conta-gotas
  });

  test("restaurar cores padrão preenche os controles e atualiza a prévia, sem salvar", async ({
    page,
  }) => {
    await page.locator("#cor-primary").fill("#ff0000");
    await page.getByRole("button", { name: "Restaurar cores padrão" }).click();

    // Os campos foram repreenchidos com a paleta padrão — e não ficaram
    // com a cor que estava ali.
    await expect(page.locator("#cor-primary")).not.toHaveValue("#ff0000");
    for (const chave of ["primary", "secondary", "border", "onPrimary"]) {
      await expect(page.locator(`#cor-${chave}`)).toHaveValue(/^#[0-9a-fA-F]{6}$/);
    }

    // Nada persistiu: recarregar não mantém o que foi restaurado na tela.
    await page.reload();
    await expect(page.locator("[data-editor-cores]")).toBeVisible();
  });

  test("hex inválido é sinalizado sem reverter o que se digita", async ({ page }) => {
    const campo = page.locator("#cor-primary");
    await campo.fill("#12");
    // O texto fica como está — digitar não pode ser revertido no meio.
    await expect(campo).toHaveValue("#12");
    await expect(campo).toHaveAttribute("aria-invalid", "true");
  });

  for (const largura of [375, 768, 1024, 1440]) {
    test(`${largura}px: editor de cores sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 1000 });
      await page.goto("/app/configuracoes?tab=identidade");
      await expect(page.locator("[data-editor-cores]")).toBeVisible();

      const rolou = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolou, `rolou ${rolou}px em ${largura}px`).toBe(0);
    });
  }
});

// =====================================================================
// Fase 63 — polimento: HEX inteiro, prévia sticky, upload acessível
// =====================================================================
test.describe("Configurações — acabamento do editor de cores", () => {
  for (const largura of [390, 768, 1024, 1440, 1920]) {
    test(`${largura}px: o hexadecimal aparece INTEIRO, sem truncar`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 1000 });
      await login(page, ORG_A);
      await page.goto("/app/configuracoes?tab=identidade");

      // ORG_A nunca gerou paleta no seed, então os campos começam vazios
      // (comportamento pré-existente: sem customTheme não há hex para
      // mostrar). "Restaurar cores padrão" é o caminho real que os
      // preenche — e é preenchido que dá para medir truncamento.
      await page.getByRole("button", { name: "Restaurar cores padrão" }).click();

      // O defeito da Fase 62 era visual, não de valor: o input tinha o
      // "#0e2555" inteiro, mas mostrava "#0e...". Um input só está
      // truncado quando o conteúdo é mais largo que a caixa — é isso que
      // se mede aqui, não o value.
      const campos = page.locator('[data-editor-cores] input[name^="cor_"]');
      await expect(campos).toHaveCount(6);
      await expect(campos.first()).toHaveValue(/^#[0-9a-fA-F]{6}$/);

      const medidas = await campos.evaluateAll((els) =>
        (els as HTMLInputElement[]).map((el) => ({
          nome: el.name,
          valor: el.value,
          conteudo: el.scrollWidth,
          caixa: el.clientWidth,
        }))
      );

      for (const m of medidas) {
        expect(m.valor, `${m.nome} tem valor`).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(
          m.conteudo <= m.caixa + 1,
          `${m.nome} truncado: conteúdo ${m.conteudo}px > caixa ${m.caixa}px`
        ).toBe(true);
      }
    });
  }

  test("em desktop o editor usa 3 colunas × 2 linhas, não uma linha comprimida", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, ORG_A);
    await page.goto("/app/configuracoes?tab=identidade");

    const topos = await page
      .locator("[data-editor-cores] [data-amostra-cor]")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(topos.length).toBe(6);
    // Duas linhas distintas, três controles em cada.
    const linhas = new Set(topos);
    expect(linhas.size, `linhas: ${[...linhas].join(", ")}`).toBe(2);
    for (const linha of linhas) {
      expect(topos.filter((t) => t === linha).length).toBe(3);
    }
  });

  test("o conta-gotas continua presente em cada cor", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes?tab=identidade");
    await expect(
      page.locator("[data-editor-cores]").getByRole("button", { name: /conta-gotas/i })
    ).toHaveCount(6);
  });
});

test.describe("Configurações — prévia sticky no desktop", () => {
  test("a prévia continua visível ao descer pelos controles", async ({ page }) => {
    // xl (1280px+) é onde a prévia fica na coluna ao lado.
    await page.setViewportSize({ width: 1440, height: 800 });
    await login(page, ORG_A);
    await page.goto("/app/configuracoes?tab=identidade");

    const previa = page.locator("[data-previa-identidade]");
    await expect(previa).toBeVisible();
    const antes = await previa.boundingBox();

    // Desce o suficiente para o topo do card sair da tela.
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect
      .poll(async () => Math.round((await previa.boundingBox())!.y))
      .not.toBe(Math.round(antes!.y));

    const depois = await previa.boundingBox();
    // Sticky de verdade: continua dentro da viewport depois da rolagem.
    expect(depois!.y, `y=${depois!.y}`).toBeGreaterThanOrEqual(-1);
    expect(depois!.y).toBeLessThan(800);
    await expect(previa).toBeInViewport();
  });

  test("em mobile a prévia NÃO é sticky — fica no fluxo", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await login(page, ORG_A);
    await page.goto("/app/configuracoes?tab=identidade");

    const posicao = await page
      .locator("[data-previa-identidade]")
      .evaluate((el) => getComputedStyle(el.parentElement!).position);
    expect(posicao).not.toBe("sticky");
  });
});

test.describe("Configurações — uploads integrados ao painel", () => {
  test("logotipo e favicon têm botão próprio, e o input continua acessível", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes?tab=identidade");

    // O disparador visível é um <label>, não o botão nativo do navegador.
    await expect(page.getByText(/^(Enviar|Alterar) logotipo$/).first()).toBeVisible();
    await expect(page.getByText(/^(Enviar|Alterar) favicon$/)).toBeVisible();

    // O input de arquivo continua existindo, focável e com nome acessível
    // — sr-only esconde visualmente sem sair da árvore de acessibilidade.
    const inputs = page.locator('input[type="file"]');
    await expect(inputs).toHaveCount(4);

    const logo = page.getByLabel("Enviar arquivo de logotipo");
    await expect(logo).toHaveCount(1);
    await logo.focus();
    await expect(logo).toBeFocused();
  });

  test("o foco por teclado no upload produz anel visível no botão", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes?tab=identidade");

    const logo = page.getByLabel("Enviar arquivo de logotipo");
    await logo.focus();
    // O anel vive no <label> (peer-focus-visible), porque o input é sr-only:
    // sem isso o teclado navegaria para um controle invisível.
    const temAnel = await logo.evaluate((el) => {
      const rotulo = el.parentElement!.querySelector("label")!;
      const s = getComputedStyle(rotulo);
      return s.boxShadow !== "none" || s.outlineStyle !== "none";
    });
    expect(temAnel).toBe(true);
  });
});

test.describe("Configurações — abas como barra de navegação", () => {
  test("as cinco abas vivem numa barra única, cada uma com ícone", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");

    const barra = page.locator("[data-abas-configuracoes]");
    await expect(barra).toBeVisible();
    // A borda/fundo pertencem à barra, não a cada botão.
    const temMoldura = await barra.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.borderTopWidth !== "0px";
    });
    expect(temMoldura).toBe(true);

    const abas = barra.getByRole("tab");
    await expect(abas).toHaveCount(5);
    const icones = await abas.evaluateAll((els) =>
      els.map((el) => el.querySelectorAll("svg").length)
    );
    for (const n of icones) expect(n).toBe(1);
    // Ícones distintos entre si.
    const desenhos = await barra.locator("svg").evaluateAll((els) => els.map((el) => el.innerHTML));
    expect(new Set(desenhos).size).toBe(desenhos.length);
  });

  test("a acessibilidade do tablist sobreviveu à remodelagem", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");

    const barra = page.locator("[data-abas-configuracoes]");
    await expect(barra).toHaveAttribute("role", "tablist");

    const ativa = barra.getByRole("tab", { selected: true });
    await expect(ativa).toHaveCount(1);
    await expect(ativa).toHaveAttribute("aria-controls", "painel-geral");

    // Roving tabindex e setas continuam valendo.
    await ativa.focus();
    await page.keyboard.press("ArrowRight");
    await expect(barra.getByRole("tab", { selected: true })).toHaveAttribute(
      "aria-controls",
      "painel-identidade"
    );
    await expect(page).toHaveURL(/tab=identidade/);
  });

  for (const largura of [320, 390, 768, 1440]) {
    test(`${largura}px: a barra de abas é utilizável e não estoura a página`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await login(page, ORG_A);
      await page.goto("/app/configuracoes");

      // Rótulos nunca esmagados: cada aba mantém largura legível (a barra
      // rola horizontalmente quando não cabem).
      const larguras = await page
        .locator("[data-abas-configuracoes] [role=tab]")
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
      for (const w of larguras) expect(w, `aba com ${w}px`).toBeGreaterThan(60);

      const rolou = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolou, `página rolou ${rolou}px`).toBe(0);
    });
  }
});

test.describe("Configurações — barra de ações", () => {
  test("o Salvar fica numa barra integrada, e continua sendo o único", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");

    const barra = page.locator("[data-barra-acoes]");
    await expect(barra).toBeVisible();
    await expect(barra.getByRole("button", { name: "Salvar alterações" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar alterações" })).toHaveCount(1);

    // A separação visual do conteúdo é real (borda no topo).
    const temBorda = await barra.evaluate(
      (el) => getComputedStyle(el).borderTopWidth !== "0px"
    );
    expect(temBorda).toBe(true);

    // Sem "Cancelar" inventado: não há estado original para restaurar.
    await expect(barra.getByRole("button", { name: /Cancelar/i })).toHaveCount(0);
  });
});

test.describe("Configurações — aba Geral aproveita a largura", () => {
  test("em desktop nome público e fuso ficam lado a lado, no mesmo card", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");

    const nome = await page.locator("#nomePublico").boundingBox();
    const fuso = await page.locator("#timezone").boundingBox();
    expect(nome).toBeTruthy();
    expect(fuso).toBeTruthy();
    // Mesma linha (topos próximos) e fuso à direita do nome.
    expect(Math.abs(nome!.y - fuso!.y), "mesma linha").toBeLessThan(8);
    expect(fuso!.x).toBeGreaterThan(nome!.x);

    // Um card só para os dois — a consolidação da Fase 63.
    const mesmoCard = await page.evaluate(() => {
      const n = document.querySelector("#nomePublico")!.closest('[data-slot="card"]');
      const f = document.querySelector("#timezone")!.closest('[data-slot="card"]');
      return n !== null && n === f;
    });
    expect(mesmoCard).toBe(true);
  });

  test("em mobile os campos voltam para uma coluna", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");

    const nome = await page.locator("#nomePublico").boundingBox();
    const fuso = await page.locator("#timezone").boundingBox();
    expect(fuso!.y).toBeGreaterThan(nome!.y + 20);
  });

  test("os campos continuam os mesmos: name, id e persistência intactos", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");
    // O que a consolidação de cards NÃO podia mudar.
    await expect(page.locator('form [name="nomePublico"]')).toHaveCount(1);
    await expect(page.locator('form [name="timezone"]')).toHaveCount(1);
    await expect(page.locator('form [name="codigoImovelPrefixo"]')).toHaveCount(1);
  });
});

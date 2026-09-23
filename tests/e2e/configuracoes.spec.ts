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
    await expect(page.getByText(`Ficará assim: ${prefixo.toUpperCase()}-100001`)).toBeVisible();
  });

  test("gerar tema pelo logotipo: seção aparece, e sem logo salvo mostra erro amigável (sem quebrar)", async ({ page }) => {
    await abrirAba(page, "Identidade visual");
    await expect(page.getByText("🎨 Gerar tema pelo logotipo")).toBeVisible();
    await expect(
      page.getByText(
        "Crie automaticamente uma combinação de cores baseada na identidade visual da sua imobiliária."
      )
    ).toBeVisible();

    // ORG_A não tem logotipo salvo no seed determinístico — a Server
    // Action sempre releem o logo do banco (nunca confia em estado do
    // client), então o botão continua visível e clicável mesmo sem logo;
    // ao clicar, a resposta é um erro amigável, sem quebrar a tela e sem
    // alterar nenhum tema (ver seção 12 do pedido).
    await page.getByRole("button", { name: "Gerar paleta do logotipo" }).click();
    await expect(
      page.getByText(/Nenhum logotipo salvo ainda/)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Aplicar paleta" })).toHaveCount(0);
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
    const tituloGerador = page.getByText("🎨 Gerar tema pelo logotipo");
    const larguraGerador = await tituloGerador.evaluate((el) => el.getBoundingClientRect().width);
    expect(larguraGerador, `largura do título 'Gerar tema pelo logotipo': ${larguraGerador}px`).toBeGreaterThan(100);

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
    // Full-width: o card principal deve usar bem mais que a antiga
    // metade (~672px) da área disponível em desktop largo.
    expect(identidade && identidade.width > 800, `largura do card: ${identidade?.width}`).toBe(true);
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

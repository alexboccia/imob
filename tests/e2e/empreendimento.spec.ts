import { test, expect, type Page } from "@playwright/test";
import { IDS_E2E, ORG_A, ORG_EMPREENDIMENTO, ORG_CAPTACAO_CORRETOR, login } from "./helpers";

// =======================================================================
// Outras unidades neste empreendimento (Fase 38)
// =======================================================================
// O título afirma PERTENCIMENTO, e só pode ser dito porque o domínio
// ganhou identidade estrutural (Property.developmentId). Antes disso o
// produto só sabia que dois imóveis eram parecidos.
//
// Organização V (dedicada), com um cenário em que cada exclusão tem um
// caso real que a prova. Ver prisma/seed-e2e.ts, "Fase 38".

const BASE = "/e2e-org-empreendimento";
const FICHA_ALPHA1 = `${BASE}/imoveis/${IDS_E2E.imovelAlpha1}`;
const FICHA_AVULSO = `${BASE}/imoveis/${IDS_E2E.imovelAvulso}`;
const FICHA_SOLO = `${BASE}/imoveis/${IDS_E2E.imovelSoloAlpha}`;

const TITULO = "Outras unidades neste empreendimento";

function secao(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: TITULO }) });
}

// -----------------------------------------------------------------------
// O que a seção mostra — e o que ela NUNCA mostra
// -----------------------------------------------------------------------
test.describe("a seção só mostra unidades do mesmo empreendimento", () => {
  test("aparece com o título correto e os cards das outras unidades", async ({ page }) => {
    await page.goto(FICHA_ALPHA1);

    const bloco = secao(page);
    await expect(bloco).toBeVisible();
    await expect(page.getByRole("heading", { name: TITULO })).toBeVisible();

    // As outras unidades do Alpha, até o limite de 4.
    await expect(bloco.getByRole("link", { name: /Alpha Unidade 2 E2E/ })).toBeVisible();
    await expect(bloco.getByRole("link", { name: /Alpha Unidade 3 E2E/ })).toBeVisible();
    await expect(bloco.getByRole("link", { name: /Alpha Unidade 4 E2E/ })).toBeVisible();
  });

  test("NUNCA a própria unidade, outro empreendimento, avulsa ou não publicável", async ({
    page,
  }) => {
    await page.goto(FICHA_ALPHA1);
    const texto = (await secao(page).innerText()).replace(/ /g, " ");

    // A unidade que o visitante já está vendo.
    expect(texto).not.toContain("Alpha Unidade 1 E2E");
    // Outro empreendimento da MESMA organização.
    expect(texto).not.toContain("Beta Unidade 1 E2E");
    // Imóvel sem empreendimento nenhum.
    expect(texto).not.toContain("Avulso Sem Empreendimento E2E");
    // Política pública: vendida não é unidade que se possa comprar.
    expect(texto).not.toContain("Alpha Unidade Vendida E2E");
  });

  test("o limite é 4 — a quinta unidade não é renderizada", async ({ page }) => {
    await page.goto(FICHA_ALPHA1);
    // São 5 outras unidades públicas no empreendimento; a ficha mostra 4.
    await expect(secao(page).getByRole("link", { name: /Alpha Unidade/ })).toHaveCount(4);
  });

  test("outro tenant nunca alcança este empreendimento", async ({ page }) => {
    // A Org A tem o seu próprio catálogo e nenhum imóvel Alpha; a ficha
    // do Alpha 1 não existe sob o slug dela.
    const resposta = await page.goto(`/e2e-org-a/imoveis/${IDS_E2E.imovelAlpha1}`);
    expect(resposta?.status()).toBe(404);
  });
});

// -----------------------------------------------------------------------
// Quando a seção NÃO deve existir
// -----------------------------------------------------------------------
test.describe("ausência da seção", () => {
  test("imóvel sem empreendimento não ganha bloco vazio", async ({ page }) => {
    await page.goto(FICHA_AVULSO);
    await expect(page.getByRole("heading", { name: TITULO })).toHaveCount(0);
  });

  test("empreendimento com uma única unidade também não", async ({ page }) => {
    // Pertence a um empreendimento, mas não há OUTRAS unidades — e um
    // "nenhuma outra unidade" seria ruído numa página de conversão.
    await page.goto(FICHA_SOLO);
    await expect(page.getByRole("heading", { name: TITULO })).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------
// Navegação
// -----------------------------------------------------------------------
test("o card leva à ficha daquela unidade, no mesmo tenant", async ({ page }) => {
  await page.goto(FICHA_ALPHA1);
  const card = secao(page).getByRole("link", { name: /Alpha Unidade 2 E2E/ }).first();
  await expect(card).toHaveAttribute("href", `${BASE}/imoveis/${IDS_E2E.imovelAlpha2}`);

  await card.click();
  await page.waitForURL(`${BASE}/imoveis/${IDS_E2E.imovelAlpha2}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Alpha Unidade 2 E2E");

  // E a ficha da unidade 2 mostra as outras — inclusive a 1, que agora
  // deixou de ser "a atual".
  await expect(
    secao(page).getByRole("link", { name: /Alpha Unidade 1 E2E/ })
  ).toBeVisible();
  await expect(secao(page).getByRole("link", { name: /Alpha Unidade 2 E2E/ })).toHaveCount(0);
});

// -----------------------------------------------------------------------
// A invariante semântica continua valendo
// -----------------------------------------------------------------------
test("proximidade geográfica continua NÃO sendo unidade do empreendimento", async ({
  page,
}) => {
  await page.goto(FICHA_ALPHA1);
  // As duas seções coexistem e nunca se confundem: uma responde "o que
  // mais tem neste empreendimento", a outra "o que mais tem por perto".
  const proximos = page.getByRole("heading", { name: "Imóveis próximos que você pode gostar" });
  if ((await proximos.count()) > 0) {
    const blocoProximos = page
      .locator("section")
      .filter({ has: proximos });
    expect((await blocoProximos.innerText()).toLowerCase()).not.toContain("unidades neste");
  }
});

// -----------------------------------------------------------------------
// Responsivo
// -----------------------------------------------------------------------
test.describe("responsivo", () => {
  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: a seção não estoura nem corta os cards`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(FICHA_ALPHA1);

      const bloco = secao(page);
      await expect(bloco).toBeVisible();
      await expect(bloco.getByRole("link", { name: /Alpha Unidade 2 E2E/ })).toBeVisible();

      const caixa = await bloco.boundingBox();
      expect(caixa, `sem bounding box @ ${largura}px`).not.toBeNull();
      expect(caixa!.x + caixa!.width, `bloco cortado @ ${largura}px`).toBeLessThanOrEqual(
        largura + 1
      );

      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
    });
  }
});

// -----------------------------------------------------------------------
// CRM — o caminho que declara a relação
// -----------------------------------------------------------------------
test.describe("gestão de empreendimentos", () => {
  test("o gestor cria, vê a contagem de unidades e não consegue excluir o que está em uso", async ({
    page,
  }) => {
    await login(page, ORG_EMPREENDIMENTO);
    await page.goto("/app/empreendimentos");

    await expect(page.getByRole("heading", { level: 1, name: "Empreendimentos" })).toBeVisible();
    const alpha = page.locator("li").filter({ hasText: "Residencial Alpha E2E" });
    await expect(alpha).toHaveCount(1);
    // 6 unidades vinculadas (5 públicas + a vendida) — a contagem é de
    // gestão, então inclui o que não está no site.
    await expect(alpha).toContainText("6 unidades");

    // Excluir é RECUSADO enquanto houver unidade: excluir empreendimento
    // jamais mexe em imóvel.
    await alpha.getByRole("button", { name: "Excluir" }).click();
    await expect(alpha.getByText(/Desvincule/)).toBeVisible();
    await page.reload();
    await expect(
      page.locator("li").filter({ hasText: "Residencial Alpha E2E" })
    ).toHaveCount(1);

    // Criar um novo funciona, e nome repetido é recusado.
    const nome = `Novo Empreendimento ${Date.now()}`;
    await page.getByLabel("Novo empreendimento").fill(nome);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("Empreendimento criado.")).toBeVisible();

    await page.getByLabel("Novo empreendimento").fill("Residencial Alpha E2E");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("Já existe um empreendimento com esse nome.")).toBeVisible();
  });

  test("o formulário do imóvel oferece o empreendimento como seletor, nunca texto livre", async ({
    page,
  }) => {
    await login(page, ORG_EMPREENDIMENTO);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelAlpha1}`);

    const seletor = page.locator("#empreendimentoId");
    await expect(seletor).toBeVisible();
    // Abre no vínculo REAL da unidade.
    await expect(seletor).toContainText("Residencial Alpha E2E");
    // E o campo não é um input de texto — identidade é ID, não string.
    await expect(page.locator('input[name="empreendimentoId"][type="text"]')).toHaveCount(0);
  });
});

// =======================================================================
// Redesenho visual — sistema de backoffice (Fase 71)
// =======================================================================
// Cobre só a apresentação: hierarquia, estado vazio, ausência de
// funcionalidade inventada e responsividade. As regras de negócio (quem
// cria/renomeia/exclui, quando a exclusão é recusada, o vínculo com
// Property) já estão provadas em tests/integration/empreendimento.test.ts
// e no describe "gestão de empreendimentos" acima — ambos continuam
// passando sem nenhuma adaptação.

test.describe("estrutura da tela redesenhada (Fase 71)", () => {
  test("hierarquia de cabeçalhos: h1 -> dois h2, sem salto para h3", async ({ page }) => {
    await login(page, ORG_EMPREENDIMENTO);
    await page.goto("/app/empreendimentos");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText("Empreendimentos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      page.getByRole("heading", { level: 2, name: "Empreendimentos cadastrados" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Novo empreendimento" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  });

  test("renomear atualiza o nome exibido e preserva a contagem de unidades", async ({
    page,
  }) => {
    await login(page, ORG_EMPREENDIMENTO);
    await page.goto("/app/empreendimentos");

    const novoNome = `Residencial Alpha Renomeado ${Date.now()}`;
    const alpha = page.locator("li").filter({ hasText: "Residencial Alpha E2E" });
    await expect(alpha).toContainText("6 unidades");

    await alpha.getByRole("button", { name: "Renomear" }).click();
    await alpha.getByLabel("Novo nome").fill(novoNome);
    await alpha.getByRole("button", { name: "Salvar nome" }).click();

    // A action não devolve mensagem de sucesso inline (comportamento
    // original, preservado) — a prova é o nome refletido na lista. SEM
    // reload: a action já revalida a rota e o React Server Component
    // reenvia os novos props ao cliente sozinho; um reload imediato
    // depois de só um `.click()` (que não espera a action pendente
    // terminar) corre risco de recarregar ANTES da mutação persistir.
    // `expect(...).toHaveCount(1)` já tenta de novo sozinho até a UI
    // reflecir o novo nome, sem essa corrida.
    const renomeado = page.locator("li").filter({ hasText: novoNome });
    await expect(renomeado).toHaveCount(1);
    await expect(renomeado).toContainText("6 unidades");
    await expect(
      page.locator("li").filter({ hasText: "Residencial Alpha E2E" })
    ).toHaveCount(0);

    // Devolve o estado original — este arquivo roda mais testes contra o
    // mesmo seed determinístico. O formulário de edição continua ABERTO
    // depois do sucesso (comportamento original preservado: `editando`
    // é estado local, a action não o fecha) — não precisa clicar em
    // "Renomear" de novo, o campo já está lá.
    await renomeado.getByLabel("Novo nome").fill("Residencial Alpha E2E");
    await renomeado.getByRole("button", { name: "Salvar nome" }).click();
    await expect(
      page.locator("li").filter({ hasText: "Residencial Alpha E2E" })
    ).toHaveCount(1);
  });

  test("nome repetido ao renomear é recusado com a mensagem existente", async ({ page }) => {
    await login(page, ORG_EMPREENDIMENTO);
    await page.goto("/app/empreendimentos");

    const beta = page.locator("li").filter({ hasText: "Residencial Beta E2E" });
    await beta.getByRole("button", { name: "Renomear" }).click();
    await beta.getByLabel("Novo nome").fill("Residencial Alpha E2E");
    await beta.getByRole("button", { name: "Salvar nome" }).click();

    await expect(beta.getByText("Já existe um empreendimento com esse nome.")).toBeVisible();
    // E o nome original continua intacto.
    await expect(
      page.locator("li").filter({ hasText: "Residencial Beta E2E" })
    ).toHaveCount(1);
  });

  test("um papel sem gestão vê a lista mas nenhuma ação de gerenciar", async ({ page }) => {
    await login(page, ORG_CAPTACAO_CORRETOR);
    await page.goto("/app/empreendimentos");

    await expect(page.getByRole("heading", { level: 1, name: "Empreendimentos" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Empreendimentos cadastrados" })
    ).toBeVisible();
    // A seção inteira de criação não existe para quem não gerencia — não
    // só o botão escondido, a seção toda.
    await expect(
      page.getByRole("heading", { level: 2, name: "Novo empreendimento" })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Renomear" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Excluir" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Adicionar" })).toHaveCount(0);
  });

  test("nenhuma busca, filtro, paginação ou aba foi inventada", async ({ page }) => {
    await login(page, ORG_EMPREENDIMENTO);
    await page.goto("/app/empreendimentos");

    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.locator('input[type="search"]')).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.locator("select")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: /páginas|paginação/i })).toHaveCount(0);
  });
});

test.describe("estado vazio (Fase 71)", () => {
  // Org A nunca recebeu um empreendimento (nenhum spec cria Development
  // lá) — mesma fixture-padrão de "vazio garantido" já usada nas fases
  // anteriores para esta mesma verificação estrutural.
  test("usa o componente compartilhado, com texto factual e sem CTA duplicado", async ({
    page,
  }) => {
    await login(page, ORG_A);
    await page.goto("/app/empreendimentos");

    const vazio = page.locator("[data-estado-vazio]");
    await expect(vazio).toBeVisible();
    await expect(vazio.getByText("Nenhum empreendimento cadastrado")).toBeVisible();
    await expect(
      vazio.getByText(/organizar os imóveis que são unidades do mesmo empreendimento/)
    ).toBeVisible();
    // Sem CTA dentro do vazio: o formulário de criação já está logo
    // abaixo, na seção "Novo empreendimento" — duplicar seria redundante.
    await expect(vazio.getByRole("button")).toHaveCount(0);
    await expect(vazio.getByRole("link")).toHaveCount(0);
  });
});

test.describe("responsivo (Fase 71)", () => {
  // Larguras alinhadas ao conjunto canônico já usado nas demais páginas
  // redesenhadas do backoffice.
  for (const largura of [1920, 1440, 1366, 1024, 768, 390]) {
    test(`${largura}px: sem overflow, input e botão utilizáveis`, async ({ page }) => {
      await login(page, ORG_EMPREENDIMENTO);
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/empreendimentos");

      await expect(page.getByRole("heading", { level: 1, name: "Empreendimentos" })).toBeVisible();
      const alpha = page.locator("li").filter({ hasText: "Residencial Alpha E2E" });
      await expect(alpha).toBeVisible();

      const semOverflowDocumento = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflowDocumento, `overflow horizontal do documento em ${largura}px`).toBe(true);

      // O input de criação e o botão "Adicionar" continuam visíveis e
      // clicáveis mesmo na largura mais estreita (empilham via flex-wrap,
      // nunca somem nem ficam sobrepostos).
      await expect(page.locator('input[name="nome"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "Adicionar" })).toBeVisible();

      // Cabeçalhos sem truncamento — medidos contra o scrollWidth real.
      const medidas = await page
        .locator("h1, h2")
        .evaluateAll((els) =>
          els.map((el) => ({
            texto: (el.textContent ?? "").trim(),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          }))
        );
      for (const m of medidas) {
        expect(
          m.scrollWidth,
          `"${m.texto}" cortado em ${largura}px`
        ).toBeLessThanOrEqual(m.clientWidth + 1);
      }
    });
  }
});

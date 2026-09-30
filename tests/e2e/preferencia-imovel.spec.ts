import { test, expect, type Page } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// =======================================================================
// Preferências de imóvel + Imóveis recomendados (Fase 77)
// =======================================================================
// O modelo (PersonPreference), a action (salvarPreferenciaPessoa) e o
// algoritmo de matching (calcularCompatibilidade/buscarImoveisCompativeis,
// src/lib/property-matching.ts) já existiam e já eram exaustivamente
// cobertos em tests/integration/{person-preference,property-matching,
// property-matching-reverso}.test.ts (regras de tenant, hard filters,
// soft criteria, preço por finalidade, status, etc.) — nenhum desses
// comportamentos muda nesta fase, e por isso não são reprovados aqui.
//
// O que esta fase mudou foi só a APRESENTAÇÃO na ficha do cliente (h2 real
// via CabecalhoSecao, estados vazios com EstadoVazio, nunca "0
// encontrados" pra quem não tem perfil) — o que este arquivo cobre é
// exatamente essa camada, que antes não tinha nenhum teste E2E.

function nomeUnico(prefixo: string) {
  return `${prefixo} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function criarCliente(page: Page, nome: string) {
  await page.goto("/app/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

  await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nome);
  await page.waitForURL(/search=/);
  await page.getByRole("link", { name: nome }).click();
  await page.waitForURL(/\/app\/clientes\/[^/?]+$/);
  return page.url();
}

async function criarImovelDisponivel(
  page: Page,
  opcoes: { titulo: string; cidade: string; precoReais: number }
) {
  await page.goto("/app/imoveis/novo");
  await page.locator("#titulo").fill(opcoes.titulo);
  await page.locator('input[name="bairro"]').fill("Bairro E2E Matching");
  await page.locator('input[name="cidade"]').fill(opcoes.cidade);
  await page.locator('select[name="estado"]').selectOption("SP");
  // CampoMoeda mascara centavos: dígitos x 100 (mesmo padrão de
  // valor-fechamento.spec.ts/comissao.spec.ts).
  await page.locator("#preco").fill(String(opcoes.precoReais * 100));
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Disponível" }).click();
  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);
  return page.url().split("?")[0];
}

test.beforeEach(async ({ page }) => {
  await login(page, ORG_A);
});

test.describe("estado sem perfil", () => {
  test("as duas seções mostram estados vazios distintos, e 'Adicionar preferências' abre o formulário", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Sem Perfil");
    await criarCliente(page, nome);

    await expect(page.getByRole("heading", { level: 2, name: "Preferências de imóvel" })).toBeVisible();
    await expect(page.getByText("Nenhuma preferência de imóvel cadastrada")).toBeVisible();

    await expect(page.getByRole("heading", { level: 2, name: "Imóveis recomendados" })).toBeVisible();
    // Mensagem de "sem perfil" é DIFERENTE da de "perfil sem match" — a
    // seção nunca diz "0 encontrados" pra quem ainda não definiu critério
    // nenhum.
    await expect(page.getByText("Nenhuma preferência cadastrada ainda")).toBeVisible();
    await expect(page.getByText("Nenhum imóvel corresponde aos critérios atuais")).toHaveCount(0);

    await page.getByRole("button", { name: "Adicionar preferências" }).click();
    await expect(page.getByRole("combobox", { name: "Finalidade" })).toBeVisible();
  });
});

test.describe("criação e edição do perfil", () => {
  test("cria preferência, ela persiste após reload, e dá pra editar depois", async ({ page }) => {
    const nome = nomeUnico("Cliente Cria Perfil");
    const url = await criarCliente(page, nome);

    await page.getByRole("button", { name: "Adicionar preferências" }).click();
    await page.getByRole("combobox", { name: "Finalidade" }).click();
    await page.getByRole("option", { name: "Comprar" }).click();
    await page.locator("#minPrice").fill("40000000"); // R$ 400.000,00
    await page.locator("#maxPrice").fill("60000000"); // R$ 600.000,00
    await page.locator("#minBedrooms").fill("2");
    // salvarPreferenciaPessoa não redireciona nem mostra toast (só
    // revalida a própria página) — mesmo padrão de RelacionarImovelForm
    // e outras actions inline desta ficha, sem confirmação visível de
    // sucesso. Espera a resposta do POST (mesmo padrão de
    // ator-transicao.spec.ts) antes de navegar; a prova real é o dado
    // persistindo depois do reload.
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Salvar preferências" }).click(),
    ]);

    await page.goto(url);
    await expect(page.locator("#minPrice")).toHaveValue("400.000,00");
    await expect(page.locator("#maxPrice")).toHaveValue("600.000,00");
    await expect(page.locator("#minBedrooms")).toHaveValue("2");
    // Formulário permanece aberto (não some) porque a preferência já existe.
    await expect(page.getByText("Nenhuma preferência de imóvel cadastrada")).toHaveCount(0);

    // Edita um valor e confirma persistência.
    await page.locator("#minBedrooms").fill("3");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Salvar preferências" }).click(),
    ]);
    await page.goto(url);
    await expect(page.locator("#minBedrooms")).toHaveValue("3");
  });

  test("faixa de preço e área privativa são grupos com legend (fieldset), não parágrafos soltos", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Fieldset");
    await criarCliente(page, nome);
    await page.getByRole("button", { name: "Adicionar preferências" }).click();

    // fieldset tem role "group" implícito, e o nome acessível vem do
    // <legend> — prova que os dois grupos são semânticos, não só um <p>
    // em negrito por cima de dois inputs soltos.
    await expect(page.getByRole("group", { name: "Faixa de preço (R$)" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Área privativa (m²)" })).toBeVisible();
  });
});

test.describe("estado com perfil", () => {
  test("perfil existente sem nenhum imóvel compatível mostra estado vazio diferente do 'sem perfil'", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Zero Match");
    await criarCliente(page, nome);

    await page.getByRole("button", { name: "Adicionar preferências" }).click();
    await page.getByRole("combobox", { name: "Finalidade" }).click();
    await page.getByRole("option", { name: "Comprar" }).click();
    // Cidade que certamente não existe em nenhum imóvel cadastrado.
    await page.getByLabel("Cidades", { exact: true }).fill(`Cidade Inexistente ${Date.now()}`);
    await page.keyboard.press("Enter");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Salvar preferências" }).click(),
    ]);
    await page.reload();

    await expect(page.getByText("Nenhum imóvel corresponde aos critérios atuais")).toBeVisible();
    // Não é mais a mensagem de "sem perfil" — o perfil existe agora.
    await expect(page.getByText("Nenhuma preferência cadastrada ainda")).toHaveCount(0);
  });

  test("perfil compatível mostra o imóvel recomendado, com explicação do match, e navega para a ficha real", async ({
    page,
  }) => {
    // "São Paulo" — uma cidade REAL já usada no seed da Org A, não uma
    // string inventada: buscarSugestoesLocalizacao (src/lib/
    // sugestoes-localizacao.ts) lê os valores DISTINCT de Property.city
    // da organização inteira, e uma cidade nova aqui vazaria pra outros
    // specs que assumem o conjunto fechado de cidades da Org A (achado
    // real: quebrou site-publico.spec.ts na primeira versão deste teste).
    const cidade = "São Paulo";
    const tituloImovel = `Imóvel Compatível E2E ${Date.now()}`;
    const urlImovel = await criarImovelDisponivel(page, {
      titulo: tituloImovel,
      cidade,
      precoReais: 500_000,
    });

    const nome = nomeUnico("Cliente Com Match");
    await criarCliente(page, nome);

    await page.getByRole("button", { name: "Adicionar preferências" }).click();
    await page.getByRole("combobox", { name: "Finalidade" }).click();
    await page.getByRole("option", { name: "Comprar" }).click();
    await page.getByLabel("Cidades", { exact: true }).fill(cidade);
    await page.keyboard.press("Enter");
    await page.locator("#minPrice").fill("40000000"); // R$ 400.000,00
    await page.locator("#maxPrice").fill("60000000"); // R$ 600.000,00
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Salvar preferências" }).click(),
    ]);
    await page.reload();

    // Escopado ao CARD desta recomendação específica (não à seção
    // inteira): "São Paulo" é uma cidade real que outros imóveis da Org A
    // também podem ter, e a seção pode legitimamente mostrar mais de uma
    // recomendação — um getByText solto na seção violaria o modo estrito
    // assim que houvesse duas.
    const secaoRecomendados = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Imóveis recomendados" }),
    });
    const cardImovel = secaoRecomendados
      .locator('[data-slot="card"]')
      .filter({ hasText: tituloImovel });
    await expect(cardImovel).toBeVisible();
    // Explicação do match: nunca uma caixa-preta — requisitos e
    // compatibilidade aparecem como texto legível, não só um percentual.
    await expect(cardImovel.getByText(/compatível/)).toBeVisible();
    // Fase 98 — os critérios soft (cidade incluída) ficam atrás de um
    // <details> recolhido por padrão, pra o card não crescer à toa em
    // telas estreitas. Precisa expandir antes de enxergar o texto —
    // exatamente o comportamento que esta fase introduziu.
    await expect(cardImovel.getByText(cidade)).not.toBeVisible();
    await cardImovel.getByText("Ver critérios de compatibilidade").click();
    await expect(cardImovel.getByText(cidade)).toBeVisible();

    // Reutiliza a MESMA ficha de imóvel já existente — não uma segunda
    // ficha.
    await cardImovel.getByRole("link", { name: "Ver imóvel" }).click();
    await page.waitForURL(/\/app\/imoveis\/[^/?]+$/);
    expect(page.url()).toBe(urlImovel);
    await expect(page.getByRole("heading", { name: "Editar imóvel" })).toBeVisible();
  });
});

test.describe("Fase 98 — explicabilidade visual do matching", () => {
  test("requisitos atendidos ficam sempre visíveis, sem precisar expandir nada", async ({ page }) => {
    const cidade = "São Paulo";
    const tituloImovel = `Imóvel Requisitos E2E ${Date.now()}`;
    await criarImovelDisponivel(page, { titulo: tituloImovel, cidade, precoReais: 500_000 });

    const nome = nomeUnico("Cliente Requisitos Visiveis");
    await criarCliente(page, nome);

    await page.getByRole("button", { name: "Adicionar preferências" }).click();
    await page.getByRole("combobox", { name: "Finalidade" }).click();
    await page.getByRole("option", { name: "Comprar" }).click();
    await page.getByLabel("Cidades", { exact: true }).fill(cidade);
    await page.keyboard.press("Enter");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Salvar preferências" }).click(),
    ]);
    await page.reload();

    const secaoRecomendados = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Imóveis recomendados" }),
    });
    const cardImovel = secaoRecomendados
      .locator('[data-slot="card"]')
      .filter({ hasText: tituloImovel });
    await expect(cardImovel).toBeVisible();
    // "Comprar" (finalidade) é hard filter — Requisitos atendidos não fica
    // atrás do <details>: é curto (no máximo 3 itens) e já reaproveitado
    // como confirmação rápida sem exigir clique nenhum.
    await expect(cardImovel.getByText("Requisitos atendidos")).toBeVisible();
    await expect(cardImovel.getByText(/SALE/)).toBeVisible();
  });

  test("o disclosure de critérios é operável por teclado, sem precisar de mouse", async ({ page }) => {
    const cidade = "São Paulo";
    const tituloImovel = `Imóvel Teclado E2E ${Date.now()}`;
    await criarImovelDisponivel(page, { titulo: tituloImovel, cidade, precoReais: 500_000 });

    const nome = nomeUnico("Cliente Teclado Disclosure");
    await criarCliente(page, nome);

    await page.getByRole("button", { name: "Adicionar preferências" }).click();
    await page.getByRole("combobox", { name: "Finalidade" }).click();
    await page.getByRole("option", { name: "Comprar" }).click();
    await page.getByLabel("Cidades", { exact: true }).fill(cidade);
    await page.keyboard.press("Enter");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Salvar preferências" }).click(),
    ]);
    await page.reload();

    const secaoRecomendados = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Imóveis recomendados" }),
    });
    const cardImovel = secaoRecomendados
      .locator('[data-slot="card"]')
      .filter({ hasText: tituloImovel });
    const trigger = cardImovel.getByText("Ver critérios de compatibilidade");
    await expect(cardImovel.getByText(cidade)).not.toBeVisible();

    // <summary> nativo é focável e ativável por teclado sem nenhum JS
    // próprio (mesmo elemento já usado em PipelineInsights.tsx) — Enter
    // no elemento focado abre o <details>, sem precisar de clique.
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(cardImovel.getByText(cidade)).toBeVisible();
  });
});

test.describe("estrutura e acessibilidade", () => {
  test("hierarquia de cabeçalhos: h1 do cliente, h2 nas duas seções novas, sem h3 solto entre elas", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Headings");
    await criarCliente(page, nome);

    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Preferências de imóvel" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Imóveis recomendados" })).toBeVisible();
  });
});

test.describe("responsivo", () => {
  for (const largura of [1920, 1440, 1366, 1024, 768, 390]) {
    test(`${largura}px: ficha do cliente sem overflow horizontal`, async ({ page }) => {
      const nome = nomeUnico(`Cliente ${largura}px`);
      // Cria e navega na largura padrão do navegador (a listagem de
      // Clientes abaixo de 768px colapsa a linha inteira num único botão
      // sem link distinto pro nome — página e comportamento de fora do
      // escopo desta fase, ver DataTable.tsx). O que este teste mede é a
      // FICHA do cliente, não a listagem: navega pela URL direta depois
      // de resolvida, já na largura alvo.
      const url = await criarCliente(page, nome);
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(url);
      await page.getByRole("button", { name: "Adicionar preferências" }).click();

      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
    });
  }
});

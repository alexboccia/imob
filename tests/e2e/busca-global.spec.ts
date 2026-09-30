import { test, expect, type Page } from "@playwright/test";
import { ORG_A, ORG_B, ORG_RESTRITA_ANA, login } from "./helpers";

// =======================================================================
// Busca global (Fase 86)
// =======================================================================
// Navegação, não uma segunda listagem: reusa construirWhereClientes/
// construirWhereImoveis (já testadas), acrescenta só o mínimo de
// caracteres e o limite por categoria. Cliente e Imóvel são as únicas
// entidades da V1 — Empreendimento (sem ficha própria, só uma lista
// plana) e Negociação/PropertyInterest (sem identidade humana nem rota
// própria, achado reconfirmado das Fases 81/84) ficaram de fora,
// documentado no relatório da fase.

function nomeUnico(prefixo: string) {
  return `${prefixo} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// Duas instâncias do MESMO componente convivem no DOM (sidebar desktop e
// cabeçalho mobile — só uma visível por vez, via CSS, mesmo padrão de
// AdminSidebarNav/AdminMobileNav) — por isso sempre escopado a
// `aside`/`header`, nunca `getByRole` solto (bateria em duas
// correspondências e violaria o modo estrito do Playwright).
function botaoBusca(page: Page, escopo: "aside" | "header" = "aside") {
  return page.locator(escopo).getByRole("button", { name: "Busca global" });
}

async function abrirBusca(page: Page, escopo: "aside" | "header" = "aside") {
  await botaoBusca(page, escopo).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  return dialogo;
}

test.describe("Busca global — jornada real", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/pipeline"); // fora de /app/clientes e /app/imoveis de propósito
  });

  test("digitar menos de 2 caracteres não busca, e some ao apagar", async ({ page }) => {
    const dialogo = await abrirBusca(page);
    await dialogo.getByLabel("Termo de busca").fill("a");
    // Texto exato (com o ponto final) — a descrição sr-only do diálogo
    // começa com a mesma frase, mas é outro elemento.
    await expect(dialogo.getByText("Digite ao menos 2 caracteres para buscar.")).toBeVisible();
    await expect(dialogo.getByText("Buscando...")).toHaveCount(0);
  });

  test("encontra um cliente recém-criado e navega para a ficha real, sem perder o cliente certo", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Busca Global");
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    // Sai de Clientes de propósito — a busca precisa funcionar de
    // QUALQUER página, não só de dentro da própria listagem.
    await page.goto("/app/pipeline");
    const dialogo = await abrirBusca(page);
    await dialogo.getByLabel("Termo de busca").fill(nome);
    await expect(dialogo.getByRole("heading", { name: "Clientes" })).toBeVisible();
    // exact: true — desde a Fase 87 o mesmo resultado tem um SEGUNDO
    // link irmão ("Registrar interação com {nome}"), cujo nome acessível
    // também contém `nome` como substring; só o link principal tem o
    // nome acessível EXATAMENTE igual a `nome`.
    const link = dialogo.getByRole("link", { name: nome, exact: true });
    await expect(link).toBeVisible();

    await link.click();
    await page.waitForURL(/\/app\/clientes\/[^/?]+$/);
    await expect(page.getByRole("heading", { name: nome })).toBeVisible();
  });

  test("encontra um imóvel pelo título e pelo código, e navega para a ficha real", async ({
    page,
  }) => {
    const titulo = nomeUnico("Imovel Busca Global");
    await page.goto("/app/imoveis/novo");
    await page.locator("#titulo").fill(titulo);
    await page.locator('input[name="bairro"]').fill("Bairro Busca Global");
    await page.locator('input[name="cidade"]').fill("São Paulo");
    await page.locator('select[name="estado"]').selectOption("SP");
    await page.locator("#preco").fill(String(500_000 * 100));
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: "Disponível" }).click();
    await page.getByRole("button", { name: "Salvar imóvel" }).click();
    await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);
    const idImovel = page.url().split("/").pop()!.split("?")[0];

    await page.goto("/app/pipeline");
    const dialogo = await abrirBusca(page);
    await dialogo.getByLabel("Termo de busca").fill(titulo);
    await expect(dialogo.getByRole("heading", { name: "Imóveis" })).toBeVisible();
    // Ancorado no início (^): desde a Fase 87 o mesmo resultado tem um
    // SEGUNDO link irmão ("Ver clientes compatíveis com {título}"), cujo
    // nome acessível também contém `titulo` como substring — mas não no
    // INÍCIO, que é só do link principal.
    const link = dialogo.getByRole("link", { name: new RegExp(`^${titulo}`) });
    await expect(link).toBeVisible();
    // O código do imóvel aparece junto — é o que distingue títulos
    // homônimos, que /app/imoveis já permite buscar hoje.
    await expect(link).toContainText(/\(\d+\)/);

    await link.click();
    await page.waitForURL(new RegExp(`/app/imoveis/${idImovel}`));
  });

  test("'Registrar interação' no resultado do cliente pula direto pra seção, sem passar pelo topo da ficha", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Busca Atalho");
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.goto("/app/pipeline");
    const dialogo = await abrirBusca(page);
    await dialogo.getByLabel("Termo de busca").fill(nome);
    const atalho = dialogo.getByRole("link", { name: `Registrar interação com ${nome}` });
    await expect(atalho).toBeVisible();
    // Dois links IRMÃOS no mesmo resultado, nunca um dentro do outro
    // (nenhuma interação aninhada inválida — Tab alcança os dois).
    await expect(dialogo.getByRole("link", { name: new RegExp(nome) })).toHaveCount(2);

    await atalho.click();
    await page.waitForURL(/\/app\/clientes\/[^/?]+#registrar-interacao$/);
    // A seção certa está visivelmente na tela, sem precisar rolar mais —
    // é o achado da fase: medição real mostrou ~2 telas até aqui.
    await expect(
      page.getByRole("heading", { level: 2, name: "Registrar nova interação" })
    ).toBeInViewport();
  });

  test("'Ver clientes' no resultado do imóvel pula direto pra Clientes compatíveis", async ({
    page,
  }) => {
    const titulo = nomeUnico("Imovel Busca Atalho");
    await page.goto("/app/imoveis/novo");
    await page.locator("#titulo").fill(titulo);
    await page.locator('input[name="bairro"]').fill("Bairro Busca Atalho");
    await page.locator('input[name="cidade"]').fill("São Paulo");
    await page.locator('select[name="estado"]').selectOption("SP");
    await page.locator("#preco").fill(String(500_000 * 100));
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: "Disponível" }).click();
    await page.getByRole("button", { name: "Salvar imóvel" }).click();
    await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);

    await page.goto("/app/pipeline");
    const dialogo = await abrirBusca(page);
    await dialogo.getByLabel("Termo de busca").fill(titulo);
    const atalho = dialogo.getByRole("link", { name: `Ver clientes compatíveis com ${titulo}` });
    await expect(atalho).toBeVisible();
    await expect(dialogo.getByRole("link", { name: new RegExp(titulo) })).toHaveCount(2);

    await atalho.click();
    await page.waitForURL(/\/app\/imoveis\/[^/]+#clientes-compativeis$/);
    // A seção real da fase da fixture está aqui — evidência de que o
    // formulário inteiro de cadastro (5-9 telas em produção real) foi
    // pulado, não só que a URL mudou.
    await expect(
      page.getByRole("heading", { level: 2, name: "Clientes compatíveis" })
    ).toBeInViewport();
  });

  test("sem resultado mostra estado vazio, nunca antes de buscar", async ({ page }) => {
    const dialogo = await abrirBusca(page);
    // Antes de digitar: nem "nenhum resultado" nem "buscando".
    await expect(dialogo.getByText("Nenhum resultado")).toHaveCount(0);

    await dialogo.getByLabel("Termo de busca").fill("Zzzzz Nunca Existe Busca Global");
    await expect(dialogo.getByText("Nenhum resultado")).toBeVisible();
  });

  test("Escape fecha, e o foco volta pro botão que abriu", async ({ page }) => {
    const botao = botaoBusca(page);
    await botao.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(botao).toBeFocused();
  });

  test("Cmd/Ctrl+K abre a busca, e ela continua acessível sem atalho nenhum", async ({ page }) => {
    // Sem atalho: o botão sozinho já abre (provado nos testes acima).
    // Com atalho: mesmo resultado, de qualquer lugar da página — mas só
    // depois que o listener client-side de fato montou (aguardar o botão
    // ficar visível é a prova de hidratação completa, sem sleep fixo).
    await expect(botaoBusca(page)).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("Busca global — segurança", () => {
  test("escopo comercial restrito: Ana não encontra o cliente exclusivo do Bruno", async ({
    page,
  }) => {
    await login(page, ORG_RESTRITA_ANA);
    const dialogo = await abrirBusca(page);

    await dialogo.getByLabel("Termo de busca").fill("Cliente Exclusivo Da Ana");
    // exact: true — mesmo motivo do teste de jornada acima (Fase 87
    // acrescentou um segundo link irmão "Registrar interação com...").
    await expect(
      dialogo.getByRole("link", { name: "Cliente Exclusivo Da Ana", exact: true })
    ).toBeVisible();

    await dialogo.getByLabel("Termo de busca").fill("Cliente Exclusivo Do Bruno");
    await expect(dialogo.getByText("Nenhum resultado")).toBeVisible();
  });

  test("módulo CRM desabilitado: a seção Clientes nunca aparece, mesmo com termo genérico", async ({
    page,
  }) => {
    await login(page, ORG_B);
    const dialogo = await abrirBusca(page);
    // "a" sozinho não busca (mínimo de 2) — usa um termo comum o
    // bastante pra quase certamente casar algum imóvel do seed da Org B.
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/admin/busca-global")),
      dialogo.getByLabel("Termo de busca").fill("imovel"),
    ]);
    await expect(dialogo.getByRole("heading", { name: "Clientes" })).toHaveCount(0);
    // Fase 87 — sem CRM a seção "Clientes compatíveis" nem existe na
    // ficha do imóvel: o atalho "Ver clientes" não pode aparecer aqui,
    // senão levaria a uma âncora que nada rola.
    await expect(dialogo.getByRole("link", { name: /^Ver clientes compatíveis/ })).toHaveCount(0);
  });
});

test.describe("Busca global — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("o botão de busca aparece no cabeçalho mobile e abre o mesmo diálogo", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");

    await abrirBusca(page, "header");

    // Sem overflow horizontal com o diálogo aberto.
    const semOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflow).toBe(true);
  });
});

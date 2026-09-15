import { test, expect } from "@playwright/test";
import { IDS_E2E, ORG_INBOX, login } from "./helpers";

// =======================================================================
// Ficha do imóvel — "Clientes interessados" e "Clientes compatíveis"
// =======================================================================
// As duas seções que ficam ABAIXO do formulário seguem o mesmo padrão
// visual do resto da tela e das Configurações: um card por assunto, com
// título e uma linha dizendo o que o bloco mostra, e linhas de lista
// dentro dele — nunca um card dentro de um card, nem um bloco mais
// estreito que o formulário logo acima.
//
// Isto é teste de ESTRUTURA, não de estética: sem ele nada impede a
// recomendação de voltar a ser um card aninhado ou os cabeçalhos de
// voltarem a ser um texto pequeno sem contexto.
//
// Organização Q (dedicada): tem uma negociação que nenhum teste fecha e
// um cliente com preferência cadastrada, então as duas seções têm
// conteúdo real — não estado vazio, onde toda asserção seria vazia.

const FICHA = `/app/imoveis/${IDS_E2E.imovelFechamentoDialogo}`;

test.beforeEach(async ({ page }) => {
  await login(page, ORG_INBOX);
});

test("as duas seções são cards com título e descrição, como as Configurações", async ({
  page,
}) => {
  await page.goto(FICHA);
  await expect(page.getByRole("heading", { level: 1, name: "Editar imóvel" })).toBeVisible();

  await expect(page.getByText("Clientes interessados", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Quem está negociando este imóvel e qual é o próximo passo de cada um.")
  ).toBeVisible();

  await expect(page.getByText("Clientes compatíveis", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Clientes cujas preferências cadastradas combinam com este imóvel.")
  ).toBeVisible();
});

test("o interessado é uma linha da lista, com nome, estágio, próxima ação e ações", async ({
  page,
}) => {
  await page.goto(FICHA);

  const card = cardDe(page, "Clientes interessados");
  const linha = card.locator("li").filter({ hasText: "Vera Dialogo" });
  await expect(linha).toHaveCount(1);

  // O nome leva à ficha do cliente; o estágio aparece em texto.
  await expect(linha.getByRole("link", { name: "Vera Dialogo" })).toHaveAttribute(
    "href",
    `/app/clientes/${IDS_E2E.pessoaFechamentoDialogo}`
  );
  await expect(linha).toContainText("Próxima ação:");
  await expect(linha.getByRole("button", { name: "Agendar visita" })).toBeVisible();
  await expect(linha.getByRole("button", { name: "Marcar como ganho" })).toBeVisible();
  await expect(linha.getByRole("button", { name: "Marcar como perdido" })).toBeVisible();

  // Linha de lista, nunca uma caixa dentro da caixa.
  await expect(card.locator('[data-slot="card"]')).toHaveCount(0);
});

test("a recomendação compatível é uma linha da lista, não um card dentro do card", async ({
  page,
}) => {
  await page.goto(FICHA);

  const card = cardDe(page, "Clientes compatíveis");
  const linha = card.locator("li").filter({ hasText: "Wanda Compativel" });
  await expect(linha).toHaveCount(1);
  await expect(linha.getByRole("link", { name: "Ver cliente" })).toHaveAttribute(
    "href",
    `/app/clientes/${IDS_E2E.pessoaCompativelInbox}`
  );

  await expect(card.locator('[data-slot="card"]')).toHaveCount(0);
});

// As duas seções compartilham a largura do formulário acima — antes elas
// eram `max-w-3xl` e ficavam visivelmente mais estreitas que os cards do
// formulário na mesma página.
test("as seções têm a mesma largura dos cards do formulário", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(FICHA);

  const largura = async (titulo: string) => {
    const caixa = await cardDe(page, titulo).boundingBox();
    expect(caixa, `sem bounding box: ${titulo}`).not.toBeNull();
    return Math.round(caixa!.width);
  };

  const referencia = await largura("Identificação");
  expect(await largura("Clientes interessados")).toBe(referencia);
  expect(await largura("Clientes compatíveis")).toBe(referencia);
});

for (const largura of [320, 390, 768, 1280]) {
  test(`${largura}px: as seções de clientes não estouram a tela`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto(FICHA);
    await expect(page.getByText("Clientes interessados", { exact: true })).toBeVisible();

    const semOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
  });
}

// O card inteiro a partir do seu título — o título é um <div>
// (CardTitle), não um heading, então subir até o [data-slot="card"] é o
// caminho estável.
function cardDe(page: import("@playwright/test").Page, titulo: string) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(titulo, { exact: true }) })
    .first();
}

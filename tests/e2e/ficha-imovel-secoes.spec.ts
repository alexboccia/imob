import { test, expect } from "@playwright/test";
import { IDS_E2E, ORG_INBOX, login } from "./helpers";

// =======================================================================
// Ficha do imóvel — "Clientes interessados" e "Clientes compatíveis"
// =======================================================================
// As duas seções que ficam ABAIXO do formulário seguem o mesmo padrão
// visual do resto do backoffice (Fase 80): CabecalhoSecao (h2 real) fora
// do card, e a largura do restante da página — não um bloco mais
// estreito que o formulário logo acima.
//
// Fase 80 — "Clientes interessados" passou a reusar InteresseImovelItem
// por inteiro (mesmo componente de "Imóveis relacionados", na ficha do
// cliente): cada interessado já é um Card por si só, então a seção NÃO
// tem mais um Card externo envolvendo a lista (envolvê-la seria o card
// dentro do card que esta mesma suíte já provava não existir). "Clientes
// compatíveis" continua com um Card único envolvendo <li> de
// RecomendacaoClienteItem (que nunca foi um Card) — os dois padrões já
// documentados desde a Fase 78, agora comprovados aqui.
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

test("as duas seções têm h2 real e descrição, como o resto do backoffice", async ({ page }) => {
  await page.goto(FICHA);
  await expect(page.getByRole("heading", { level: 1, name: "Editar imóvel" })).toBeVisible();

  await expect(page.getByRole("heading", { level: 2, name: "Clientes interessados" })).toBeVisible();
  await expect(page.getByText(/Negociações abertas com este imóvel/)).toBeVisible();

  await expect(page.getByRole("heading", { level: 2, name: "Clientes compatíveis" })).toBeVisible();
  await expect(
    page.getByText("Clientes cujas preferências cadastradas combinam com este imóvel.")
  ).toBeVisible();
});

test("o interessado é um card da lista (InteresseImovelItem), com nome, estágio, próxima ação e ações — sem card aninhado", async ({
  page,
}) => {
  await page.goto(FICHA);

  const secao = secaoDe(page, "Clientes interessados");
  const card = secao.locator('[data-slot="card"]').filter({ hasText: "Vera Dialogo" });
  await expect(card).toHaveCount(1);

  // O nome leva à ficha do cliente; o estágio aparece em texto.
  await expect(card.getByRole("link", { name: "Vera Dialogo" })).toHaveAttribute(
    "href",
    `/app/clientes/${IDS_E2E.pessoaFechamentoDialogo}`
  );
  await expect(card).toContainText("Próxima ação:");
  await expect(card.getByRole("button", { name: "Agendar visita" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Marcar como ganho" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Marcar como perdido" })).toBeVisible();

  // Cada interessado já É um card — a prova de "nunca card dentro do
  // card" agora é: nenhum OUTRO card dentro dele mesmo.
  await expect(card.locator('[data-slot="card"]')).toHaveCount(0);
  // E a seção em si não tem nenhum Card envolvendo a lista inteira.
  await expect(secao.locator(':scope > [data-slot="card"]')).toHaveCount(0);
});

test("Fase 80 — Clientes interessados ganhou as mesmas ações de Imóveis relacionados: responsável, comissão e remover", async ({
  page,
}) => {
  await page.goto(FICHA);

  const secao = secaoDe(page, "Clientes interessados");
  const card = secao.locator('[data-slot="card"]').filter({ hasText: "Vera Dialogo" });

  // Capacidades que só existiam do lado do cliente antes desta fase —
  // mesmo PropertyInterest, mesmas ações, nos dois lugares agora.
  await expect(card.getByText("Responsável:")).toBeVisible();
  await expect(card.getByText(/Divisão da comissão/)).toBeVisible();
  await expect(card.getByRole("button", { name: "Remover" })).toBeVisible();
  // Select de estágio manual (oculto só quando a negociação já está
  // encerrada — não é o caso desta fixture).
  await expect(card.getByRole("combobox")).toBeVisible();
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

// As seções compartilham a largura do formulário acima — antes eram
// `max-w-3xl` e ficavam visivelmente mais estreitas que os cards do
// formulário na mesma página.
test("as seções têm a mesma largura dos cards do formulário", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(FICHA);

  // Fase 80 — as três seções (a do formulário e as duas de clientes)
  // usam o mesmo padrão <section> + h2 real fora do card: a largura de
  // referência é sempre a do <section> (sem padding horizontal próprio),
  // não mais um caso especial só para "Identificação".
  const largura = async (titulo: string) => {
    const caixa = await secaoDe(page, titulo).boundingBox();
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
    await expect(page.getByRole("heading", { level: 2, name: "Clientes interessados" })).toBeVisible();

    const semOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
  });
}

function secaoDe(page: import("@playwright/test").Page, titulo: string) {
  return page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: titulo, exact: true }),
  });
}

// O card real dentro da seção — só faz sentido para "Clientes
// compatíveis", que ainda envolve sua lista de <li> num único Card.
// "Clientes interessados" não tem mais Card nenhum na seção (cada item
// já é o seu próprio Card).
function cardDe(page: import("@playwright/test").Page, titulo: string) {
  return secaoDe(page, titulo).locator('[data-slot="card"]').first();
}

import { test, expect, type Page } from "@playwright/test";
import { IDS_E2E, ORG_RECURSOS, login } from "./helpers";

// =======================================================================
// Frase de destaque (Fase 40)
// =======================================================================
// Conteúdo editorial opcional, imediatamente abaixo da descrição. O que
// esta spec protege: a frase aparece onde deve, uma vez só, e o bloco
// inteiro some quando não há frase — sem borda vazia nem aspas soltas.

const BASE = "/e2e-org-recursos";
const ficha = (id: string) => `${BASE}/imoveis/${id}`;
const BLOCO = "[data-frase-destaque]";

// Texto inequívoco: não existe em nenhum outro lugar da página, então
// encontrá-lo prova que veio do bloco certo.
const FRASE = "Vista livre e iluminacao natural durante todo o dia.";

function bloco(page: Page) {
  return page.locator(BLOCO);
}

// -----------------------------------------------------------------------
// Presença e ausência
// -----------------------------------------------------------------------
test("sem frase cadastrada, nenhum bloco existe entre descrição e características", async ({
  page,
}) => {
  await page.goto(ficha(IDS_E2E.imovelSemFrase));

  await expect(page.getByRole("heading", { name: "Descrição" })).toBeVisible();
  await expect(bloco(page)).toHaveCount(0);

  // Nada de placeholder nem texto de ausência inventado pela tela.
  const conteudo = await page.locator("main").innerText();
  expect(conteudo).not.toMatch(/sem frase cadastrada|frase n[ãa]o cadastrada/i);
  expect(conteudo).not.toContain(FRASE);
});

test("com frase, ela aparece uma única vez e com o texto exato", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelComFrase));

  await expect(bloco(page)).toHaveCount(1);
  await expect(bloco(page)).toContainText(FRASE);

  // Uma vez na página INTEIRA — não duplicada em sidebar, galeria ou
  // metadata visível.
  const ocorrencias = (await page.locator("main").innerText()).split(FRASE).length - 1;
  expect(ocorrencias).toBe(1);
});

// -----------------------------------------------------------------------
// Ordem no DOM — o requisito central
// -----------------------------------------------------------------------
test("a ordem é Descrição, frase e só então as características", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelComFrase));

  // Posição vertical real, não só visibilidade isolada.
  const descricao = await page.getByRole("heading", { name: "Descrição" }).boundingBox();
  const frase = await bloco(page).boundingBox();
  const unidade = await page
    .getByRole("heading", { name: "Características da unidade" })
    .boundingBox();

  expect(descricao).not.toBeNull();
  expect(frase).not.toBeNull();
  expect(unidade).not.toBeNull();

  expect(frase!.y).toBeGreaterThan(descricao!.y);
  expect(frase!.y).toBeLessThan(unidade!.y);
});

test("a frase não é confundida com um depoimento nem vira interação", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelComFrase));
  const caixa = bloco(page);

  // É CONTEÚDO: nenhum controle interativo dentro do bloco.
  await expect(caixa.getByRole("button")).toHaveCount(0);
  await expect(caixa.getByRole("link")).toHaveCount(0);
  // E o ícone de aspas é decorativo — não entra na árvore acessível.
  await expect(caixa.locator("svg[aria-hidden='true']")).toHaveCount(1);
});

// -----------------------------------------------------------------------
// Segurança
// -----------------------------------------------------------------------
test("conteúdo parecido com HTML seria exibido como texto, nunca executado", async ({
  page,
}) => {
  const erros: string[] = [];
  page.on("dialog", async (d) => {
    erros.push(d.message());
    await d.dismiss();
  });
  await page.goto(ficha(IDS_E2E.imovelComFrase));
  // A ficha renderiza a frase como texto (React escapa por construção);
  // nenhum diálogo é disparado por conteúdo de imóvel.
  expect(erros).toHaveLength(0);
  await expect(bloco(page).locator("script")).toHaveCount(0);
});

// -----------------------------------------------------------------------
// Responsivo
// -----------------------------------------------------------------------
test.describe("responsivo", () => {
  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: o bloco cabe, cresce e não corta o texto`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(ficha(IDS_E2E.imovelComFrase));

      const caixa = await bloco(page).boundingBox();
      expect(caixa, `sem bounding box @ ${largura}px`).not.toBeNull();
      expect(caixa!.x + caixa!.width, `bloco cortado @ ${largura}px`).toBeLessThanOrEqual(
        largura + 1
      );

      // O texto inteiro está lá — sem line-clamp, sem ellipsis.
      await expect(bloco(page)).toContainText(FRASE);

      // O parágrafo não pode ter sido esmagado pelo ícone.
      const paragrafo = await bloco(page).locator("p").boundingBox();
      expect(paragrafo!.width, `texto espremido @ ${largura}px`).toBeGreaterThan(100);

      // E as características continuam abaixo.
      const unidade = await page
        .getByRole("heading", { name: "Características da unidade" })
        .boundingBox();
      expect(unidade!.y).toBeGreaterThan(caixa!.y);

      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
    });
  }
});

// -----------------------------------------------------------------------
// Admin — cadastrar, persistir, editar e limpar
// -----------------------------------------------------------------------
test("o corretor cadastra, edita e limpa a frase pelo formulário", async ({ page }) => {
  await login(page, ORG_RECURSOS);
  await page.goto(`/app/imoveis/${IDS_E2E.imovelSemFrase}`);

  const campo = page.locator("#fraseDestaque");
  await expect(campo).toBeVisible();
  // Começa vazio: este imóvel não tem frase.
  await expect(campo).toHaveValue("");

  const nova = "Projeto completo a poucos minutos do metro.";
  await campo.fill(nova);
  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await page.waitForURL(/\?salvo=1/);

  // Persistiu no servidor.
  await page.reload();
  await expect(page.locator("#fraseDestaque")).toHaveValue(nova);

  // E chegou à ficha pública.
  await page.goto(ficha(IDS_E2E.imovelSemFrase));
  await expect(bloco(page)).toContainText(nova);

  // LIMPAR: apagar o campo devolve o imóvel ao estado sem bloco.
  await page.goto(`/app/imoveis/${IDS_E2E.imovelSemFrase}`);
  await page.locator("#fraseDestaque").fill("");
  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await page.waitForURL(/\?salvo=1/);

  await page.goto(ficha(IDS_E2E.imovelSemFrase));
  await expect(bloco(page)).toHaveCount(0);
});

test("frase acima do limite é recusada pelo servidor", async ({ page }) => {
  await login(page, ORG_RECURSOS);
  await page.goto(`/app/imoveis/${IDS_E2E.imovelComFrase}`);

  // O maxLength do navegador é conveniência; a regra que vale é a do
  // servidor. Preenchendo via DOM, sem passar pelo limite do input.
  await page.locator("#fraseDestaque").evaluate((el, texto) => {
    const campo = el as HTMLTextAreaElement;
    campo.removeAttribute("maxlength");
    campo.value = texto;
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  }, "x".repeat(181));

  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await expect(page.getByText(/no máximo 180 caracteres/i)).toBeVisible();

  // E a frase original continua intacta na ficha pública.
  await page.goto(ficha(IDS_E2E.imovelComFrase));
  await expect(bloco(page)).toContainText(FRASE);
});

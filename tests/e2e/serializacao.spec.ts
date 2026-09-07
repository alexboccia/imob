import { test, expect } from "@playwright/test";
import { ORG_AGENDA, login } from "./helpers";

// Fronteira Server -> Client (Fase 16) — guarda de regressão de console.
//
// LIMITE HONESTO DESTE ARQUIVO: o aviso "Only plain objects can be passed
// to Client Components" é emitido pelo runtime de DESENVOLVIMENTO. A
// suíte roda contra `next start` (build de produção), onde ele não
// existe — então este spec NÃO consegue reprovar por causa dele, e seria
// desonesto afirmar o contrário.
//
// A proteção real contra a regressão é o TIPO: `InteresseImovelItem` e
// `RecomendacaoImovelItem` declaram `price: number | null`, não
// `unknown`, então passar um Prisma Decimal cru deixou de compilar. Isso
// é verificado pelo `tsc` do job de verificação, e coberto por unitário
// (contraste com structuredClone) e integração (banco -> DTO).
//
// O que ESTE spec garante, e que os outros não garantem: que a superfície
// corrigida continua renderizando sem erro de cliente nem exceção — que
// a correção da fronteira não quebrou a página em runtime.

test.describe("Fronteira de serialização — superfície corrigida", () => {
  test("a ficha do cliente com imóvel relacionado renderiza sem erro de console", async ({
    page,
  }) => {
    const problemas: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problemas.push(`[console.error] ${m.text()}`);
      if (m.type() === "warning" && m.text().includes("Only plain objects")) {
        problemas.push(`[serializacao] ${m.text()}`);
      }
    });
    page.on("pageerror", (e) => problemas.push(`[pageerror] ${e.message}`));

    await login(page, ORG_AGENDA);

    const nome = `Cliente Serializacao ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByRole("link", { name: nome }).first().click();
    await page.locator("#propertyId").click();
    // Escopado ao listbox ABERTO: a ficha tem <select> nativos cujas
    // <option> ficam no DOM mesmo fechadas.
    await page.getByRole("listbox").getByRole("option").first().click();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Relacionar imóvel" }).click(),
    ]);
    await page.reload();

    // O preço do imóvel continua sendo exibido — a conversão na fronteira
    // não pode ter apagado o valor nem transformado null em R$ 0.
    await expect(page.locator("main")).toContainText("R$");

    expect(problemas, `console sujo:\n${problemas.join("\n")}`).toEqual([]);
  });

  test("a ficha do imóvel renderiza sem erro de console", async ({ page }) => {
    const problemas: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problemas.push(`[console.error] ${m.text()}`);
      if (m.type() === "warning" && m.text().includes("Only plain objects")) {
        problemas.push(`[serializacao] ${m.text()}`);
      }
    });
    page.on("pageerror", (e) => problemas.push(`[pageerror] ${e.message}`));

    await login(page, ORG_AGENDA);
    await page.goto("/app/imoveis");
    await page.getByRole("link", { name: /Apartamento E2E Agenda/ }).first().click();
    // Espera por um FATO da página, não por silêncio de rede: a ficha do
    // imóvel busca bairros por cidade e, no CI, o storage de mídia não
    // está configurado — `networkidle` nunca estabiliza e o teste
    // estourava em 30s. O formulário renderizado é o sinal real de que a
    // página montou.
    await expect(page.getByLabel("Título")).toBeVisible();

    expect(problemas, `console sujo:\n${problemas.join("\n")}`).toEqual([]);
  });
});

import { test, expect } from "@playwright/test";
import { ORG_B, login } from "./helpers";

// 7. menu Clientes bloqueado no plano Básico
test("menu Clientes aparece bloqueado (não clicável) e a página mostra o aviso de módulo indisponível", async ({
  page,
}) => {
  await login(page, ORG_B);

  // src/app/app/layout.tsx: sem o módulo "crm", o link vira um <span> com
  // badge "Pro", não um <a> navegável.
  const linkClientes = page.getByRole("link", { name: "Clientes" });
  await expect(linkClientes).toHaveCount(0);
  const itemClientes = page.locator("nav").getByText("Clientes");
  await expect(itemClientes).toContainText("Pro");

  // Visitar a URL diretamente também é bloqueado (defesa em profundidade,
  // não só esconder o link) — src/app/app/clientes/page.tsx checa
  // hasModule antes de rodar qualquer query.
  await page.goto("/app/clientes");
  await expect(page.getByText("CRM não incluído no seu plano")).toBeVisible();
});

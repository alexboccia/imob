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
  // Fase 62 — o item do menu passou a ter ícone, então o rótulo ganhou um
  // <span> próprio (para truncar sem empurrar o badge). getByText("Clientes")
  // agora casa esse <span> interno, cujo texto é só o rótulo: é preciso
  // apontar para o ITEM (o <span title=...> que substitui o link) para ver o
  // badge. Asserção mais forte que a anterior — cobre o ícone também.
  const itemClientes = page
    .locator('aside nav span[title="Disponível em planos superiores"]')
    .filter({ hasText: "Clientes" });
  await expect(itemClientes).toHaveCount(1);
  await expect(itemClientes).toContainText("Pro");
  await expect(itemClientes.locator("svg")).toHaveCount(1);

  // Visitar a URL diretamente também é bloqueado (defesa em profundidade,
  // não só esconder o link) — src/app/app/clientes/page.tsx checa
  // hasModule antes de rodar qualquer query.
  await page.goto("/app/clientes");
  await expect(page.getByText("CRM não incluído no seu plano")).toBeVisible();
});

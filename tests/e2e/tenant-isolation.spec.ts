import { test, expect } from "@playwright/test";
import { ORG_A, IDS_E2E, login } from "./helpers";

// 6. tenant A não acessa URL de registro do tenant B
test("usuário logado na organização A não acessa a URL de edição de um usuário da organização B", async ({
  page,
}) => {
  await login(page, ORG_A);

  // src/app/app/usuarios/[id]/page.tsx busca o membro filtrando por
  // organizationId da sessão — um id de membro de outra organização
  // simplesmente não é encontrado, mesmo sendo um id válido no banco.
  const resposta = await page.goto(`/app/usuarios/${IDS_E2E.membroOwnerOrgB}`);
  expect(resposta?.status()).toBe(404);
});

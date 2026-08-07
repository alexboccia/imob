import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { imovelValidoParaOrganizacao } from "@/lib/upload-validation";
import { criarCenario, criarImovel } from "@/test/fixtures";

// src/app/api/admin/upload/route.ts usa imovelValidoParaOrganizacao pra
// recusar anexar mídia a um imóvel que não pertence à organização do
// chamador antes de gravar qualquer coisa no R2 — a chave final também é
// prefixada com esse mesmo organizationId (`${organizationId}/${pasta}/...`).
describe("Upload — imóvel alvo precisa pertencer à organização de quem envia", () => {
  let cenarioA: Awaited<ReturnType<typeof criarCenario>> | undefined;
  let cenarioB: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  test("upload pra imóvel da própria organização é permitido", async () => {
    cenarioA = await criarCenario();
    const imovel = await criarImovel({ organizationId: cenarioA.organization.id });

    const registrado = await prisma.property.findUnique({
      where: { id: imovel.id, organizationId: cenarioA.organization.id },
    });
    expect(imovelValidoParaOrganizacao(registrado, cenarioA.organization.id)).toBe(true);
  });

  test("upload pra imóvel de outra organização é recusado", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id });

    // A mesma busca que a rota faz, já escopada pelo organizationId de A —
    // um id de imóvel de B simplesmente não é encontrado.
    const encontradoComoA = await prisma.property.findUnique({
      where: { id: imovelB.id, organizationId: cenarioA.organization.id },
    });
    expect(encontradoComoA).toBeNull();
    expect(imovelValidoParaOrganizacao(encontradoComoA, cenarioA.organization.id)).toBe(false);
  });
});

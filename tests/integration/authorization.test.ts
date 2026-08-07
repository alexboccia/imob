import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { temPapel, PAPEIS_GESTAO_CONFIGURACOES } from "@/lib/authorization";
import { criarCenario } from "@/test/fixtures";

// Mesmo padrão usado em src/app/app/configuracoes/actions.ts
// (salvarConfiguracaoContato): busca o papel do membro real da sessão e
// aplica temPapel(...) — aqui com um OrganizationMember de verdade, criado
// no banco de teste, em vez de uma string literal solta.
describe("Configuração exige role autorizada", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("OWNER pode gerenciar configurações", async () => {
    cenario = await criarCenario({ role: "OWNER" });
    const membro = await prisma.organizationMember.findUniqueOrThrow({
      where: { id: cenario.membro.id },
    });
    expect(temPapel(membro.role, PAPEIS_GESTAO_CONFIGURACOES)).toBe(true);
  });

  test("ADMIN pode gerenciar configurações", async () => {
    cenario = await criarCenario({ role: "ADMIN" });
    const membro = await prisma.organizationMember.findUniqueOrThrow({
      where: { id: cenario.membro.id },
    });
    expect(temPapel(membro.role, PAPEIS_GESTAO_CONFIGURACOES)).toBe(true);
  });

  test("BROKER não pode gerenciar configurações", async () => {
    cenario = await criarCenario({ role: "BROKER" });
    const membro = await prisma.organizationMember.findUniqueOrThrow({
      where: { id: cenario.membro.id },
    });
    expect(temPapel(membro.role, PAPEIS_GESTAO_CONFIGURACOES)).toBe(false);
  });

  test("MANAGER não pode gerenciar configurações, mesmo gerenciando catálogos", async () => {
    cenario = await criarCenario({ role: "MANAGER" });
    const membro = await prisma.organizationMember.findUniqueOrThrow({
      where: { id: cenario.membro.id },
    });
    expect(temPapel(membro.role, PAPEIS_GESTAO_CONFIGURACOES)).toBe(false);
  });
});

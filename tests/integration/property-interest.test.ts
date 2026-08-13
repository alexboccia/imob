import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";

// As Server Actions de PropertyInterest vivem em
// src/app/app/clientes/actions.ts, que importa @/lib/auth diretamente —
// mesma limitação de resolução de módulo já documentada nesta sessão
// (next-auth → next/server não resolve sob Vitest puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  criarInteressePessoa,
  atualizarEstagioInteresse,
  alternarFavoritoInteresse,
  removerInteresse,
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { buscarPipelineAberto } from "@/lib/pipeline";
import type { PropertyInterestStage } from "@/generated/prisma/client";

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

function autenticarComo(cenario: Cenario) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function relacionar(pessoaId: string, campos: Record<string, string>) {
  return criarInteressePessoa(pessoaId, ESTADO_INICIAL_ACAO, formData(campos));
}
async function mudarEstagio(interesseId: string, campos: Record<string, string>) {
  return atualizarEstagioInteresse(interesseId, ESTADO_INICIAL_ACAO, formData(campos));
}
async function favoritar(interesseId: string) {
  return alternarFavoritoInteresse(interesseId, ESTADO_INICIAL_ACAO, new FormData());
}
async function remover(interesseId: string) {
  return removerInteresse(interesseId, ESTADO_INICIAL_ACAO, new FormData());
}
async function marcarGanho(interesseId: string) {
  return marcarInteresseComoGanho(interesseId, ESTADO_INICIAL_ACAO, new FormData());
}
async function marcarPerdido(interesseId: string) {
  return marcarInteresseComoPerdido(interesseId, ESTADO_INICIAL_ACAO, new FormData());
}

async function buscarInteresse(organizationId: string, personId: string, propertyId: string) {
  return prisma.propertyInterest.findUnique({
    where: {
      organizationId_personId_propertyId: { organizationId, personId, propertyId },
      organizationId,
    },
  });
}

describe("PropertyInterest — relacionamento Person↔Property (Fase D do CRM)", () => {
  let cenario: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    vi.mocked(auth).mockReset();
    vi.mocked(redirect).mockClear();
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  test("A) cria relacionamento válido no mesmo tenant", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    const resultado = await relacionar(pessoa.id, { propertyId: imovel.id });

    expect(resultado.success).toBe(true);
    const linha = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(linha).not.toBeNull();
    expect(linha?.stage).toBe("INTERESTED");
    expect(linha?.favorited).toBe(false);
  });

  test("B) Person de outra organização é rejeitada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaDeB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelDeA = await criarImovel({ organizationId: cenario.organization.id });

    autenticarComo(cenario);
    const resultado = await relacionar(pessoaDeB.id, { propertyId: imovelDeA.id });

    expect(resultado.success).toBe(false);
    const total = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("C) Property de outra organização é rejeitado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaDeA = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelDeB = await criarImovel({ organizationId: cenarioB.organization.id });

    autenticarComo(cenario);
    const resultado = await relacionar(pessoaDeA.id, { propertyId: imovelDeB.id });

    expect(resultado.success).toBe(false);
    const total = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("D) Person e Property de outra organização rejeitados", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaDeB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelDeB = await criarImovel({ organizationId: cenarioB.organization.id });

    autenticarComo(cenario);
    const resultado = await relacionar(pessoaDeB.id, { propertyId: imovelDeB.id });

    expect(resultado.success).toBe(false);
    const total = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("E) organizationId forjado no FormData é ignorado (nunca lido, nunca usado)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    const resultado = await relacionar(pessoa.id, {
      propertyId: imovel.id,
      organizationId: cenarioB.organization.id,
    });

    expect(resultado.success).toBe(true);
    const linha = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(linha).not.toBeNull();
    expect(linha?.organizationId).toBe(cenario.organization.id);
    const naOutraOrg = await prisma.propertyInterest.count({ where: { organizationId: cenarioB.organization.id } });
    expect(naOutraOrg).toBe(0);
  });

  test("F) relacionamento duplicado não cria segunda linha", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await relacionar(pessoa.id, { propertyId: imovel.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });

    const total = await prisma.propertyInterest.count({
      where: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
    });
    expect(total).toBe(1);
  });

  test("G) constraint unique garante apenas um relacionamento por par", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
    });

    await expect(
      prisma.propertyInterest.create({
        data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
      })
    ).rejects.toThrow();
  });

  test("H) concorrência de duas criações simultâneas não duplica", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await Promise.all([
      relacionar(pessoa.id, { propertyId: imovel.id }),
      relacionar(pessoa.id, { propertyId: imovel.id }),
    ]);

    const total = await prisma.propertyInterest.count({
      where: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
    });
    expect(total).toBe(1);
  });

  test("I) alterar stage", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const resultado = await mudarEstagio(interesse!.id, { stage: "PROPOSAL" });

    expect(resultado.success).toBe(true);
    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: interesse!.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.stage).toBe("PROPOSAL");
  });

  test("J) stage não altera favorited", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    await favoritar(interesse!.id);

    await mudarEstagio(interesse!.id, { stage: "VISITED" });

    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: interesse!.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.stage).toBe("VISITED");
    expect(atualizado?.favorited).toBe(true);
  });

  test("K) favoritar", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const resultado = await favoritar(interesse!.id);

    expect(resultado.success).toBe(true);
    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: interesse!.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.favorited).toBe(true);
  });

  test("L) desfavoritar", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    await favoritar(interesse!.id); // false -> true
    await favoritar(interesse!.id); // true -> false

    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: interesse!.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.favorited).toBe(false);
  });

  test("M) favorited não altera stage", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    await mudarEstagio(interesse!.id, { stage: "PROPOSAL" });

    await favoritar(interesse!.id);

    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: interesse!.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.stage).toBe("PROPOSAL");
    expect(atualizado?.favorited).toBe(true);
  });

  test("N) atualizar notes", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    await mudarEstagio(interesse!.id, { stage: "INTERESTED", notes: "Cliente muito interessado, andar alto." });

    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: interesse!.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.notes).toBe("Cliente muito interessado, andar alto.");
  });

  test("O) remover relacionamento", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const resultado = await remover(interesse!.id);

    expect(resultado.success).toBe(true);
    const total = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("P) remoção não remove Person", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    await remover(interesse!.id);

    const pessoaAinda = await prisma.person.findUnique({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(pessoaAinda).not.toBeNull();
  });

  test("Q) remoção não remove Property", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    await remover(interesse!.id);

    const imovelAinda = await prisma.property.findUnique({
      where: { id: imovel.id, organizationId: cenario.organization.id },
    });
    expect(imovelAinda).not.toBeNull();
  });

  test("R) remoção não remove Interaction", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    const interacao = await prisma.interaction.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        type: "VISIT",
      },
    });

    await remover(interesse!.id);

    const interacaoAinda = await prisma.interaction.findUnique({
      where: { id: interacao.id, organizationId: cenario.organization.id },
    });
    expect(interacaoAinda).not.toBeNull();
  });

  test("S) remoção não remove PersonPreference", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await prisma.personPreference.create({
      data: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    await remover(interesse!.id);

    const preferenciaAinda = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(preferenciaAinda).not.toBeNull();
  });

  test("T) delete Person → PropertyInterest removido por CASCADE", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });

    await prisma.person.delete({ where: { id: pessoa.id, organizationId: cenario.organization.id } });

    const total = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("U) delete Property com PropertyInterest ativo é bloqueado por RESTRICT", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });

    await expect(
      prisma.property.delete({ where: { id: imovel.id, organizationId: cenario.organization.id } })
    ).rejects.toThrow();

    const imovelAinda = await prisma.property.findUnique({
      where: { id: imovel.id, organizationId: cenario.organization.id },
    });
    expect(imovelAinda).not.toBeNull();
    const total = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
  });

  test("V) ActivityLog de criação", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await relacionar(pessoa.id, { propertyId: imovel.id });

    const log = await prisma.activityLog.findFirst({
      where: { organizationId: cenario.organization.id, action: "property_interest_created" },
    });
    expect(log).not.toBeNull();
    expect(log?.entity).toBe("PropertyInterest");
  });

  test("W) ActivityLog de mudança de estágio", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    await mudarEstagio(interesse!.id, { stage: "PROPOSAL" });

    const log = await prisma.activityLog.findFirst({
      where: { organizationId: cenario.organization.id, action: "property_interest_stage_changed" },
    });
    expect(log).not.toBeNull();
    expect(log?.payload).toEqual({ from: "INTERESTED", to: "PROPOSAL" });
  });

  test("X) ActivityLog de mudança de favorito", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    await favoritar(interesse!.id);

    const log = await prisma.activityLog.findFirst({
      where: { organizationId: cenario.organization.id, action: "property_interest_favorite_changed" },
    });
    expect(log).not.toBeNull();
    expect(log?.payload).toEqual({ from: false, to: true });
  });

  test("Y) ActivityLog de remoção", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    await remover(interesse!.id);

    const log = await prisma.activityLog.findFirst({
      where: { organizationId: cenario.organization.id, action: "property_interest_removed" },
    });
    expect(log).not.toBeNull();
  });

  test("Z) ActivityLog nunca contém PII/notes", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({
      organizationId: cenario.organization.id,
      name: "Fulano de Tal Sigiloso",
      email: "fulano-sigiloso@email.com",
      phone: "11999990000",
    });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    await mudarEstagio(interesse!.id, { stage: "PROPOSAL", notes: "Segredo do cliente: quer pagar à vista." });
    await favoritar(interesse!.id);

    const logs = await prisma.activityLog.findMany({
      where: { organizationId: cenario.organization.id, entity: "PropertyInterest" },
    });
    expect(logs.length).toBeGreaterThan(0);
    for (const log of logs) {
      const serializado = JSON.stringify(log.payload ?? {});
      expect(serializado).not.toContain("Fulano de Tal Sigiloso");
      expect(serializado).not.toContain("fulano-sigiloso@email.com");
      expect(serializado).not.toContain("11999990000");
      expect(serializado).not.toContain("Segredo do cliente");
    }
  });

  test("AA) acesso sem autenticação redireciona pro login e não escreve nada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(null as any);

    try {
      await relacionar(pessoa.id, { propertyId: imovel.id });
    } catch {
      // esperado: redirect() mockado não interrompe o fluxo como o real
      // faria, então código adiante (que dependeria de sessão) pode
      // lançar — o que importa é confirmar abaixo que redirect foi
      // chamado e nada foi escrito.
    }

    expect(redirect).toHaveBeenCalledWith("/app/login");
    const total = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("AB) acesso sem módulo CRM habilitado é rejeitado", async () => {
    // criarCenario() sem "crm" na lista de módulos — default é ["core","properties"].
    cenario = await criarCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    const resultado = await relacionar(pessoa.id, { propertyId: imovel.id });

    expect(resultado.success).toBe(false);
    expect(resultado.message).toMatch(/CRM/);
    const total = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("AC) tentativa de alterar PropertyInterest pertencente a outro tenant é rejeitada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaDeB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelDeB = await criarImovel({ organizationId: cenarioB.organization.id });
    autenticarComo(cenarioB);
    await relacionar(pessoaDeB.id, { propertyId: imovelDeB.id });
    const interesseDeB = await buscarInteresse(cenarioB.organization.id, pessoaDeB.id, imovelDeB.id);

    autenticarComo(cenario);
    const resultado = await mudarEstagio(interesseDeB!.id, { stage: "PROPOSAL" });

    expect(resultado.success).toBe(false);
    const aindaOriginal = await prisma.propertyInterest.findUnique({
      where: { id: interesseDeB!.id, organizationId: cenarioB.organization.id },
    });
    expect(aindaOriginal?.stage).toBe("INTERESTED");
  });

  test("AD) tentativa de remover PropertyInterest de outro tenant é rejeitada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaDeB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelDeB = await criarImovel({ organizationId: cenarioB.organization.id });
    autenticarComo(cenarioB);
    await relacionar(pessoaDeB.id, { propertyId: imovelDeB.id });
    const interesseDeB = await buscarInteresse(cenarioB.organization.id, pessoaDeB.id, imovelDeB.id);

    autenticarComo(cenario);
    const resultado = await remover(interesseDeB!.id);

    expect(resultado.success).toBe(false);
    const aindaExiste = await prisma.propertyInterest.findUnique({
      where: { id: interesseDeB!.id, organizationId: cenarioB.organization.id },
    });
    expect(aindaExiste).not.toBeNull();
  });

  test("AE) lista de interesses da Person nunca retorna relacionamento de outra organização", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaA = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id });

    autenticarComo(cenario);
    await relacionar(pessoaA.id, { propertyId: imovelA.id });
    autenticarComo(cenarioB);
    await relacionar(pessoaB.id, { propertyId: imovelB.id });

    const listaA = await prisma.propertyInterest.findMany({
      where: { organizationId: cenario.organization.id, personId: pessoaA.id },
    });
    expect(listaA).toHaveLength(1);
    expect(listaA[0].organizationId).toBe(cenario.organization.id);
  });

  test("AF) lista de interessados da Property nunca retorna relacionamento de outra organização", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaA = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id });

    autenticarComo(cenario);
    await relacionar(pessoaA.id, { propertyId: imovelA.id });
    autenticarComo(cenarioB);
    await relacionar(pessoaB.id, { propertyId: imovelB.id });

    const listaImovelA = await prisma.propertyInterest.findMany({
      where: { organizationId: cenario.organization.id, propertyId: imovelA.id },
    });
    expect(listaImovelA).toHaveLength(1);
    expect(listaImovelA[0].organizationId).toBe(cenario.organization.id);
  });

  test("AH) reenvio sequencial do mesmo relacionamento gera apenas 1 ActivityLog de criação", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await relacionar(pessoa.id, { propertyId: imovel.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });

    const totalInteresses = await prisma.propertyInterest.count({
      where: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
    });
    expect(totalInteresses).toBe(1);

    const totalLogsCriacao = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, action: "property_interest_created" },
    });
    expect(totalLogsCriacao).toBe(1);
  });

  test("AJ) duas criações concorrentes geram apenas 1 ActivityLog de criação", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await Promise.all([
      relacionar(pessoa.id, { propertyId: imovel.id }),
      relacionar(pessoa.id, { propertyId: imovel.id }),
    ]);

    const totalInteresses = await prisma.propertyInterest.count({
      where: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
    });
    expect(totalInteresses).toBe(1);

    const totalLogsCriacao = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, action: "property_interest_created" },
    });
    expect(totalLogsCriacao).toBe(1);
  });

  test("AK) alterar stage sem enviar notes preserva a observação anterior", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id, notes: "nota original" });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    // formData sem a chave "notes" — mesmo caminho de um chamador que não
    // reenvia o campo.
    await mudarEstagio(interesse!.id, { stage: "PROPOSAL" });

    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: interesse!.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.stage).toBe("PROPOSAL");
    expect(atualizado?.notes).toBe("nota original");
  });

  test("AL) alterar favorite preserva notes existentes", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id, notes: "nota original" });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    await favoritar(interesse!.id);

    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: interesse!.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.favorited).toBe(true);
    expect(atualizado?.notes).toBe("nota original");
  });

  test("AM) reenviar imóvel já relacionado não reseta stage/favorited/notes existentes", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id, notes: "nota original" });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    await mudarEstagio(interesse!.id, { stage: "PROPOSAL" });
    await favoritar(interesse!.id);

    await relacionar(pessoa.id, { propertyId: imovel.id });

    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: interesse!.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.stage).toBe("PROPOSAL");
    expect(atualizado?.favorited).toBe(true);
    expect(atualizado?.notes).toBe("nota original");
  });

  test("AN) Property que não está AVAILABLE não aparece no seletor de imóveis disponíveis", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelVendido = await criarImovel({ organizationId: cenario.organization.id, status: "SOLD" });
    const imovelDisponivel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });

    // Mesma query usada em src/app/app/clientes/[id]/page.tsx pra
    // "imoveisDisponiveis".
    const disponiveis = await prisma.property.findMany({
      where: {
        organizationId: cenario.organization.id,
        status: "AVAILABLE",
        NOT: { interests: { some: { personId: pessoa.id, organizationId: cenario.organization.id } } },
      },
      select: { id: true },
    });

    const ids = disponiveis.map((p) => p.id);
    expect(ids).not.toContain(imovelVendido.id);
    expect(ids).toContain(imovelDisponivel.id);
  });

  test("AO) PropertyInterest existente continua na listagem mesmo se Property deixar de ser AVAILABLE depois", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await relacionar(pessoa.id, { propertyId: imovel.id });

    await prisma.property.update({
      where: { id: imovel.id, organizationId: cenario.organization.id },
      data: { status: "SOLD" },
    });

    const listaPessoa = await prisma.propertyInterest.findMany({
      where: { organizationId: cenario.organization.id, personId: pessoa.id },
    });
    expect(listaPessoa).toHaveLength(1);
    expect(listaPessoa[0].propertyId).toBe(imovel.id);
  });

  test("AP) ficha do cliente filtra propertyInterests explicitamente por organizationId, não só pela relação implícita", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });

    // Mesmo formato de query usado em
    // src/app/app/clientes/[id]/page.tsx (include com where explícito na
    // sub-relação propertyInterests).
    const resultado = await prisma.person.findUnique({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
      include: {
        propertyInterests: { where: { organizationId: cenario.organization.id } },
      },
    });

    expect(resultado?.propertyInterests).toHaveLength(1);
    expect(resultado?.propertyInterests[0].organizationId).toBe(cenario.organization.id);
  });

  test("AQ) imóvel já relacionado não aparece novamente no seletor de criação", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await relacionar(pessoa.id, { propertyId: imovel.id });

    const disponiveis = await prisma.property.findMany({
      where: {
        organizationId: cenario.organization.id,
        status: "AVAILABLE",
        NOT: { interests: { some: { personId: pessoa.id, organizationId: cenario.organization.id } } },
      },
      select: { id: true },
    });

    expect(disponiveis.map((p) => p.id)).not.toContain(imovel.id);
  });

  // Fase F, correção pós-auditoria: novo PropertyInterest só pode ser
  // criado com Property.status === "AVAILABLE" — regra adicionada aqui
  // (não só na UI da ficha do imóvel) porque propertyId chega via
  // FormData, que pode ser adulterado. Relacionamento HISTÓRICO nunca é
  // bloqueado por isso (ver BM).

  test("BE) Property AVAILABLE + Person compatível — cria relacionamento normalmente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });

    const resultado = await relacionar(pessoa.id, { propertyId: imovel.id });

    expect(resultado.success).toBe(true);
    const linha = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(linha).not.toBeNull();
  });

  test("BF) Property SOLD — action rejeita novo relacionamento", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "SOLD" });

    const resultado = await relacionar(pessoa.id, { propertyId: imovel.id });

    expect(resultado.success).toBe(false);
    const linha = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(linha).toBeNull();
  });

  test("BG) Property RENTED — action rejeita novo relacionamento", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "RENTED" });

    const resultado = await relacionar(pessoa.id, { propertyId: imovel.id });

    expect(resultado.success).toBe(false);
    const linha = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(linha).toBeNull();
  });

  test("BH) Property INACTIVE — action rejeita novo relacionamento", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "INACTIVE" });

    const resultado = await relacionar(pessoa.id, { propertyId: imovel.id });

    expect(resultado.success).toBe(false);
    const linha = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(linha).toBeNull();
  });

  test("BI) Property RESERVED — action rejeita novo relacionamento", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "RESERVED" });

    const resultado = await relacionar(pessoa.id, { propertyId: imovel.id });

    expect(resultado.success).toBe(false);
    const linha = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(linha).toBeNull();
  });

  test("BJ) Property DRAFT — action rejeita novo relacionamento", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "DRAFT" });

    const resultado = await relacionar(pessoa.id, { propertyId: imovel.id });

    expect(resultado.success).toBe(false);
    const linha = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(linha).toBeNull();
  });

  test("BK) rejeição por status não cria ActivityLog", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "SOLD" });

    await relacionar(pessoa.id, { propertyId: imovel.id });

    const total = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, action: "property_interest_created" },
    });
    expect(total).toBe(0);
  });

  // BL) "Property status != AVAILABLE continua retornando clientes
  // compatíveis no matching reverso" já é coberto em
  // tests/integration/property-matching-reverso.test.ts (teste E) — não
  // duplicado aqui porque é sobre buscarClientesCompativeis, não sobre
  // criarInteressePessoa.

  test("BM) existingInterest já existente continua aparecendo mesmo se Property depois virar SOLD/RENTED/etc.", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const primeiro = await relacionar(pessoa.id, { propertyId: imovel.id });
    expect(primeiro.success).toBe(true);

    await prisma.property.update({
      where: { id: imovel.id, organizationId: cenario.organization.id },
      data: { status: "SOLD" },
    });

    // Reenvio idempotente do MESMO par (ex: página recarregada, duplo
    // clique) depois que o imóvel já não está mais AVAILABLE — não pode
    // ser tratado como tentativa de relacionamento NOVO nem falhar.
    const reenvio = await relacionar(pessoa.id, { propertyId: imovel.id });
    expect(reenvio.success).toBe(true);

    const linha = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(linha).not.toBeNull();
    const total = await prisma.propertyInterest.count({
      where: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
    });
    expect(total).toBe(1);
  });

  // -------------------------------------------------------------------
  // Fundação de fechamento — WON / closedAt (Fase P.2)
  //
  // Esta fase é só fundação de schema: nenhuma Server Action de
  // fechamento existe ainda (isso é P.3) — os testes abaixo escrevem
  // diretamente via prisma.propertyInterest, nunca via
  // atualizarEstagioInteresse (que deliberadamente rejeita "WON" — ver
  // teste BS abaixo).
  // -------------------------------------------------------------------

  test("BN) PropertyInterest aceita stage WON", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const interesse = await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "WON" },
    });
    expect(interesse.stage).toBe("WON");

    const relido = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(relido?.stage).toBe("WON");
  });

  test("BO) closedAt aceita null (não setado na criação)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const interesse = await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
    });
    expect(interesse.closedAt).toBeNull();
  });

  test("BP) closedAt aceita Date explícita quando escrito diretamente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const agora = new Date();
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "WON",
        closedAt: agora,
      },
    });
    expect(interesse.closedAt?.getTime()).toBe(agora.getTime());
  });

  test("BQ) relacionamento criado pelo fluxo normal (criarInteressePessoa) continua stage INTERESTED e closedAt null, sem nenhum efeito colateral do campo/enum novos", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const resultado = await relacionar(pessoa.id, { propertyId: imovel.id });
    expect(resultado.success).toBe(true);

    const linha = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(linha?.stage).toBe("INTERESTED");
    expect(linha?.closedAt).toBeNull();
  });

  test("BR) unique organizationId+personId+propertyId permanece intacta mesmo com stage WON", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "WON" },
    });

    await expect(
      prisma.propertyInterest.create({
        data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "INTERESTED" },
      })
    ).rejects.toThrow();
  });

  test("BS) tenant scoping continua obrigatório — leitura sem organizationId explícito é recusada mesmo com o campo closedAt novo no select", async () => {
    await expect(
      prisma.propertyInterest.findMany({ select: { id: true, stage: true, closedAt: true } })
    ).rejects.toThrow(/organizationId/);
  });

  test("BT) nenhum backfill automático — registros existentes/novos nunca ganham closedAt sozinhos, migration não alterou nenhuma linha", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa1 = await criarPessoa({ organizationId: cenario.organization.id });
    const pessoa2 = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa1.id, propertyId: imovel.id, stage: "VISITED" },
    });
    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa2.id, propertyId: imovel.id, stage: "REJECTED" },
    });

    const total = await prisma.propertyInterest.count({
      where: { organizationId: cenario.organization.id, closedAt: { not: null } },
    });
    expect(total).toBe(0);
  });

  test("BU) atualizarEstagioInteresse (action manual/genérica) rejeita 'WON' — só a futura action dedicada da P.3 poderá setá-lo", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const resultado = await mudarEstagio(interesse!.id, { stage: "WON" });

    expect(resultado.success).toBe(false);
    const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(atual?.stage).toBe("INTERESTED");
    expect(atual?.closedAt).toBeNull();
  });

  test("BV) atualizarEstagioInteresse (action manual/genérica) rejeita 'REJECTED' — só marcarInteresseComoPerdido pode setá-lo (Fase P.3)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const resultado = await mudarEstagio(interesse!.id, { stage: "REJECTED" });

    expect(resultado.success).toBe(false);
    const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(atual?.stage).toBe("INTERESTED");
    expect(atual?.closedAt).toBeNull();
  });

  // -------------------------------------------------------------------
  // Fechamento oficial da negociação — marcarInteresseComoGanho/Perdido
  // (Fase P.3). Continua a numeração de letras da fundação de fechamento
  // (BN-BV, Fase P.2) acima.
  // -------------------------------------------------------------------

  async function prepararInteresseNoStage(
    cenarioAtual: Cenario,
    stage: Exclude<PropertyInterestStage, "WON" | "REJECTED">
  ) {
    const pessoa = await criarPessoa({ organizationId: cenarioAtual.organization.id });
    const imovel = await criarImovel({ organizationId: cenarioAtual.organization.id, status: "AVAILABLE" });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenarioAtual.organization.id, pessoa.id, imovel.id);
    if (stage !== "INTERESTED") {
      await mudarEstagio(interesse!.id, { stage });
    }
    return { pessoa, imovel, interesse: interesse! };
  }

  const STAGES_ABERTOS = ["INTERESTED", "VISIT_SCHEDULED", "VISITED", "PROPOSAL"] as const;

  for (const stageOrigem of STAGES_ABERTOS) {
    test(`CW-${stageOrigem}) marcarInteresseComoGanho a partir de ${stageOrigem} seta stage=WON e closedAt`, async () => {
      cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
      autenticarComo(cenario);
      const { pessoa, imovel } = await prepararInteresseNoStage(cenario, stageOrigem);
      const antesDe = new Date();

      const resultado = await marcarGanho((await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id);

      expect(resultado.success).toBe(true);
      const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
      expect(atual?.stage).toBe("WON");
      expect(atual?.closedAt).not.toBeNull();
      expect(atual!.closedAt!.getTime()).toBeGreaterThanOrEqual(antesDe.getTime());
    });

    test(`CX-${stageOrigem}) marcarInteresseComoPerdido a partir de ${stageOrigem} seta stage=REJECTED e closedAt`, async () => {
      cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
      autenticarComo(cenario);
      const { pessoa, imovel } = await prepararInteresseNoStage(cenario, stageOrigem);
      const antesDe = new Date();

      const resultado = await marcarPerdido((await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id);

      expect(resultado.success).toBe(true);
      const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
      expect(atual?.stage).toBe("REJECTED");
      expect(atual?.closedAt).not.toBeNull();
      expect(atual!.closedAt!.getTime()).toBeGreaterThanOrEqual(antesDe.getTime());
    });
  }

  test("CY) idempotência: marcarInteresseComoGanho num interesse já WON é sucesso, não altera closedAt nem duplica ActivityLog", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { pessoa, imovel } = await prepararInteresseNoStage(cenario, "INTERESTED");
    const interesseId = (await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id;
    await marcarGanho(interesseId);
    const primeiro = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    const logsAntes = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, entityId: interesseId },
    });

    const resultado = await marcarGanho(interesseId);

    expect(resultado.success).toBe(true);
    const depois = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(depois?.stage).toBe("WON");
    expect(depois?.closedAt?.getTime()).toBe(primeiro?.closedAt?.getTime());
    const logsDepois = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, entityId: interesseId },
    });
    expect(logsDepois).toBe(logsAntes);
  });

  test("CZ) idempotência: marcarInteresseComoPerdido num interesse já REJECTED é sucesso, não altera closedAt nem duplica ActivityLog", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { pessoa, imovel } = await prepararInteresseNoStage(cenario, "INTERESTED");
    const interesseId = (await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id;
    await marcarPerdido(interesseId);
    const primeiro = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    const logsAntes = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, entityId: interesseId },
    });

    const resultado = await marcarPerdido(interesseId);

    expect(resultado.success).toBe(true);
    const depois = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(depois?.stage).toBe("REJECTED");
    expect(depois?.closedAt?.getTime()).toBe(primeiro?.closedAt?.getTime());
    const logsDepois = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, entityId: interesseId },
    });
    expect(logsDepois).toBe(logsAntes);
  });

  test("DA) transição inválida: marcarInteresseComoPerdido num interesse WON é rejeitado, stage/closedAt permanecem WON", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { pessoa, imovel } = await prepararInteresseNoStage(cenario, "INTERESTED");
    const interesseId = (await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id;
    await marcarGanho(interesseId);
    const fechado = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const resultado = await marcarPerdido(interesseId);

    expect(resultado.success).toBe(false);
    const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(atual?.stage).toBe("WON");
    expect(atual?.closedAt?.getTime()).toBe(fechado?.closedAt?.getTime());
  });

  test("DB) transição inválida: marcarInteresseComoGanho num interesse REJECTED é rejeitado, stage/closedAt permanecem REJECTED", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { pessoa, imovel } = await prepararInteresseNoStage(cenario, "INTERESTED");
    const interesseId = (await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id;
    await marcarPerdido(interesseId);
    const fechado = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const resultado = await marcarGanho(interesseId);

    expect(resultado.success).toBe(false);
    const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(atual?.stage).toBe("REJECTED");
    expect(atual?.closedAt?.getTime()).toBe(fechado?.closedAt?.getTime());
  });

  test("DC) cross-tenant: interesseId de outra organização não é fechado, mensagem genérica, nada muda", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioB);
    const { interesse } = await prepararInteresseNoStage(cenarioB, "INTERESTED");

    autenticarComo(cenario);
    const resultado = await marcarGanho(interesse.id);

    expect(resultado.success).toBe(false);
    const atual = await prisma.propertyInterest.findUnique({
      where: { id: interesse.id, organizationId: cenarioB.organization.id },
    });
    expect(atual?.stage).toBe("INTERESTED");
    expect(atual?.closedAt).toBeNull();
  });

  test("DD) cross-tenant (anomalia de dado): PropertyInterest com Person de outro tenant é rejeitado por marcarInteresseComoGanho", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    // Mesma técnica de anomalia usada em scheduled-activity-visita.test.ts
    // (testes I/J): sem FK composta, o Postgres permite uma linha com
    // organizationId correto mas personId de outro tenant.
    const interesseAnomalo = await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoaB.id, propertyId: imovel.id },
    });

    autenticarComo(cenario);
    const resultado = await marcarGanho(interesseAnomalo.id);

    expect(resultado.success).toBe(false);
    const atual = await prisma.propertyInterest.findUnique({
      where: { id: interesseAnomalo.id, organizationId: cenario.organization.id },
    });
    expect(atual?.stage).toBe("INTERESTED");
    expect(atual?.closedAt).toBeNull();
  });

  test("DE) cross-tenant (anomalia de dado): PropertyInterest com Property de outro tenant é rejeitado por marcarInteresseComoPerdido", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id });
    const interesseAnomalo = await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovelB.id },
    });

    autenticarComo(cenario);
    const resultado = await marcarPerdido(interesseAnomalo.id);

    expect(resultado.success).toBe(false);
    const atual = await prisma.propertyInterest.findUnique({
      where: { id: interesseAnomalo.id, organizationId: cenario.organization.id },
    });
    expect(atual?.stage).toBe("INTERESTED");
    expect(atual?.closedAt).toBeNull();
  });

  test("DF) concorrência real: duas chamadas simultâneas de marcarInteresseComoGanho na mesma linha resultam em exatamente 1 evento property_interest_won", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { pessoa, imovel } = await prepararInteresseNoStage(cenario, "INTERESTED");
    const interesseId = (await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id;

    const [r1, r2] = await Promise.all([marcarGanho(interesseId), marcarGanho(interesseId)]);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(atual?.stage).toBe("WON");
    const totalWon = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, entityId: interesseId, action: "property_interest_won" },
    });
    expect(totalWon).toBe(1);
  });

  test("DG) concorrência real: marcarInteresseComoGanho e marcarInteresseComoPerdido simultâneos na mesma linha nunca corrompem o stage (só um dos dois vence, nunca os dois logs de fechamento juntos)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { pessoa, imovel } = await prepararInteresseNoStage(cenario, "INTERESTED");
    const interesseId = (await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id;

    const [r1, r2] = await Promise.all([marcarGanho(interesseId), marcarPerdido(interesseId)]);

    // Exatamente um dos dois "venceu a corrida" (sucesso real), o outro
    // perdeu — o Postgres serializa as duas transações, nunca deixa
    // meio-caminho. Não afirmamos QUAL dos dois vence (não determinístico),
    // só que o resultado final é consistente.
    const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(["WON", "REJECTED"]).toContain(atual?.stage);
    expect(atual?.closedAt).not.toBeNull();

    const totalWon = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, entityId: interesseId, action: "property_interest_won" },
    });
    const totalLost = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, entityId: interesseId, action: "property_interest_lost" },
    });
    // Exatamente um dos dois eventos de fechamento foi gravado, nunca os
    // dois (isso corromperia o histórico: um relacionamento não pode ter
    // sido ganho E perdido na mesma corrida).
    expect(totalWon + totalLost).toBe(1);
    expect([r1.success, r2.success].filter(Boolean).length).toBe(1);
  });

  test("DH) ActivityLog duplo de marcarInteresseComoGanho: property_interest_stage_changed({from,to:WON}) e property_interest_won, nenhum PII", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({
      organizationId: cenario.organization.id,
      name: "Cliente Sigiloso Ganho",
      email: "sigiloso-ganho@email.com",
      phone: "11988887777",
    });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    await marcarGanho(interesse!.id);

    const stageChanged = await prisma.activityLog.findFirst({
      where: {
        organizationId: cenario.organization.id,
        entityId: interesse!.id,
        action: "property_interest_stage_changed",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(stageChanged?.payload).toEqual({ from: "INTERESTED", to: "WON" });

    const won = await prisma.activityLog.findFirst({
      where: { organizationId: cenario.organization.id, entityId: interesse!.id, action: "property_interest_won" },
    });
    expect(won).not.toBeNull();

    const todosOsLogs = await prisma.activityLog.findMany({
      where: { organizationId: cenario.organization.id, entityId: interesse!.id },
    });
    for (const log of todosOsLogs) {
      const serializado = JSON.stringify(log.payload ?? {});
      expect(serializado).not.toContain("Cliente Sigiloso Ganho");
      expect(serializado).not.toContain("sigiloso-ganho@email.com");
      expect(serializado).not.toContain("11988887777");
    }
  });

  test("DI) ActivityLog duplo de marcarInteresseComoPerdido: property_interest_stage_changed({from,to:REJECTED}) e property_interest_lost, nenhum PII", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({
      organizationId: cenario.organization.id,
      name: "Cliente Sigiloso Perdido",
      email: "sigiloso-perdido@email.com",
      phone: "11977776666",
    });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    await marcarPerdido(interesse!.id);

    const stageChanged = await prisma.activityLog.findFirst({
      where: {
        organizationId: cenario.organization.id,
        entityId: interesse!.id,
        action: "property_interest_stage_changed",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(stageChanged?.payload).toEqual({ from: "INTERESTED", to: "REJECTED" });

    const lost = await prisma.activityLog.findFirst({
      where: { organizationId: cenario.organization.id, entityId: interesse!.id, action: "property_interest_lost" },
    });
    expect(lost).not.toBeNull();

    const todosOsLogs = await prisma.activityLog.findMany({
      where: { organizationId: cenario.organization.id, entityId: interesse!.id },
    });
    for (const log of todosOsLogs) {
      const serializado = JSON.stringify(log.payload ?? {});
      expect(serializado).not.toContain("Cliente Sigiloso Perdido");
      expect(serializado).not.toContain("sigiloso-perdido@email.com");
      expect(serializado).not.toContain("11977776666");
    }
  });

  test("DJ) closedAt nunca vem de FormData — campos arbitrários (closedAt, stage, organizationId) no FormData são ignorados, closedAt sempre é o instante real do servidor", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { pessoa, imovel } = await prepararInteresseNoStage(cenario, "INTERESTED");
    const interesseId = (await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id;

    const dataForjada = new Date("2000-01-01T00:00:00.000Z");
    const antesDe = new Date();
    const fd = new FormData();
    fd.set("closedAt", dataForjada.toISOString());
    fd.set("stage", "REJECTED");
    fd.set("organizationId", cenarioB.organization.id);
    const resultado = await marcarInteresseComoGanho(interesseId, ESTADO_INICIAL_ACAO, fd);

    expect(resultado.success).toBe(true);
    const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    // stage é sempre WON (a action que decide, nunca o "stage" do
    // FormData) e closedAt é o instante real do servidor, nunca a data
    // forjada de 2000.
    expect(atual?.stage).toBe("WON");
    expect(atual!.closedAt!.getTime()).toBeGreaterThanOrEqual(antesDe.getTime());
  });

  // -------------------------------------------------------------------
  // Correção pós-auditoria — precisão do `from` sob mudança de stage
  // aberto→aberto concorrente + concorrência Perdido×Perdido (achados
  // MEDIUM/LOW da auditoria pré-commit da Fase P.3).
  // -------------------------------------------------------------------

  test("DK) from no ActivityLog reflete o stage MAIS RECENTE, não um valor obsoleto: mudança aberto→aberto (INTERESTED->VISITED) antes de marcarInteresseComoGanho", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { pessoa, imovel } = await prepararInteresseNoStage(cenario, "INTERESTED");
    const interesseId = (await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id;

    // Simula uma mudança de stage aberto→aberto que aconteceu entre o
    // instante em que um chamador hipotético teria "visto" o estado e o
    // instante em que o fechamento de fato executa — grava direto via
    // Prisma pra não depender de sincronizar duas Server Actions reais em
    // paralelo (não determinístico em JS single-threaded); o fechamento
    // em si usa a Server Action real, nunca um write direto.
    await prisma.propertyInterest.update({
      where: { id: interesseId, organizationId: cenario.organization.id },
      data: { stage: "VISITED" },
    });

    const resultado = await marcarGanho(interesseId);

    expect(resultado.success).toBe(true);
    const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(atual?.stage).toBe("WON");
    const log = await prisma.activityLog.findFirst({
      where: {
        organizationId: cenario.organization.id,
        entityId: interesseId,
        action: "property_interest_stage_changed",
      },
      orderBy: { createdAt: "desc" },
    });
    // from deve ser VISITED (o stage real imediatamente anterior ao
    // fechamento que venceu), nunca INTERESTED (o valor obsoleto de
    // antes da mudança concorrente).
    expect(log?.payload).toEqual({ from: "VISITED", to: "WON" });
  });

  test("DL) mesmo princípio pra marcarInteresseComoPerdido: from reflete o stage mais recente (INTERESTED->PROPOSAL antes do fechamento)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { pessoa, imovel } = await prepararInteresseNoStage(cenario, "INTERESTED");
    const interesseId = (await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id;

    await prisma.propertyInterest.update({
      where: { id: interesseId, organizationId: cenario.organization.id },
      data: { stage: "PROPOSAL" },
    });

    const resultado = await marcarPerdido(interesseId);

    expect(resultado.success).toBe(true);
    const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(atual?.stage).toBe("REJECTED");
    const log = await prisma.activityLog.findFirst({
      where: {
        organizationId: cenario.organization.id,
        entityId: interesseId,
        action: "property_interest_stage_changed",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.payload).toEqual({ from: "PROPOSAL", to: "REJECTED" });
  });

  test("DM) concorrência real: duas chamadas simultâneas de marcarInteresseComoPerdido na mesma linha resultam em exatamente 1 evento property_interest_lost (achado LOW da auditoria — faltava o par de DF)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { pessoa, imovel } = await prepararInteresseNoStage(cenario, "INTERESTED");
    const interesseId = (await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!.id;

    const [r1, r2] = await Promise.all([marcarPerdido(interesseId), marcarPerdido(interesseId)]);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    const atual = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(atual?.stage).toBe("REJECTED");
    expect(atual?.closedAt).not.toBeNull();
    const totalLost = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, entityId: interesseId, action: "property_interest_lost" },
    });
    expect(totalLost).toBe(1);
    const totalStageChanged = await prisma.activityLog.count({
      where: {
        organizationId: cenario.organization.id,
        entityId: interesseId,
        action: "property_interest_stage_changed",
      },
    });
    expect(totalStageChanged).toBe(1);
  });

  // ---------------------------------------------------------------------
  // PropertyInterestStageHistory — histórico de estágio (Fase P.6).
  // Continua a mesma sequência de letras do arquivo (DN em diante) — mesmo
  // describe, mesmos helpers (prepararInteresseNoStage, mudarEstagio,
  // marcarGanho, marcarPerdido, buscarInteresse).
  // ---------------------------------------------------------------------

  async function historicoDe(organizationId: string, propertyInterestId: string) {
    return prisma.propertyInterestStageHistory.findMany({
      where: { organizationId, propertyInterestId },
      orderBy: { changedAt: "asc" },
    });
  }

  test("DN) atualizarEstagioInteresse: transição real cria exatamente 1 PropertyInterestStageHistory com previousStage/newStage corretos", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { interesse } = await prepararInteresseNoStage(cenario, "INTERESTED");
    // prepararInteresseNoStage já passa por criarInteressePessoa, que agora
    // (correção pós-auditoria) grava 1 history inicial (null -> INTERESTED)
    // na própria criação. A entrada sob teste aqui é a SEGUNDA.
    expect(await historicoDe(cenario.organization.id, interesse.id)).toHaveLength(1);

    await mudarEstagio(interesse.id, { stage: "PROPOSAL" });

    const historico = await historicoDe(cenario.organization.id, interesse.id);
    expect(historico).toHaveLength(2);
    expect(historico[1].previousStage).toBe("INTERESTED");
    expect(historico[1].newStage).toBe("PROPOSAL");
    expect(historico[1].organizationId).toBe(cenario.organization.id);
  });

  test("DO) atualizarEstagioInteresse: no-op (stage solicitado == stage atual) não cria history nem novo ActivityLog de mudança de estágio", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { interesse } = await prepararInteresseNoStage(cenario, "INTERESTED");
    // 1 entrada já existe (history inicial da criação) — o no-op abaixo não
    // pode adicionar nenhuma outra.
    expect(await historicoDe(cenario.organization.id, interesse.id)).toHaveLength(1);

    const resultado = await mudarEstagio(interesse.id, { stage: "INTERESTED", notes: "só editando a nota" });

    expect(resultado.success).toBe(true);
    const historico = await historicoDe(cenario.organization.id, interesse.id);
    expect(historico).toHaveLength(1);
    const totalStageChanged = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, entityId: interesse.id, action: "property_interest_stage_changed" },
    });
    expect(totalStageChanged).toBe(0);
    const atual = await buscarInteresse(cenario.organization.id, interesse.personId, interesse.propertyId);
    expect(atual?.notes).toBe("só editando a nota");
  });

  test("DP) marcarInteresseComoGanho: history criado com changedAt EXATAMENTE igual a closedAt (mesmo evento, nunca dois new Date() distintos)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { interesse } = await prepararInteresseNoStage(cenario, "PROPOSAL");
    // prepararInteresseNoStage já passa por criarInteressePessoa (1 history
    // inicial, null -> INTERESTED) e por atualizarEstagioInteresse
    // (INTERESTED -> PROPOSAL, mais 1) pra chegar no stage pedido — 2
    // entradas de setup. A entrada sob teste aqui é a TERCEIRA, criada por
    // marcarGanho.
    expect(await historicoDe(cenario.organization.id, interesse.id)).toHaveLength(2);

    await marcarGanho(interesse.id);

    const historico = await historicoDe(cenario.organization.id, interesse.id);
    expect(historico).toHaveLength(3);
    expect(historico[2].previousStage).toBe("PROPOSAL");
    expect(historico[2].newStage).toBe("WON");
    const atual = await buscarInteresse(cenario.organization.id, interesse.personId, interesse.propertyId);
    expect(atual?.closedAt).not.toBeNull();
    expect(historico[2].changedAt.getTime()).toBe(atual!.closedAt!.getTime());
  });

  test("DQ) marcarInteresseComoPerdido: history criado com newStage=REJECTED, changedAt == closedAt", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { interesse } = await prepararInteresseNoStage(cenario, "VISITED");

    await marcarPerdido(interesse.id);

    const historico = await historicoDe(cenario.organization.id, interesse.id);
    // 1 entrada da criação (null -> INTERESTED) + 1 do setup (INTERESTED ->
    // VISITED, via prepararInteresseNoStage) + 1 da própria action sob teste.
    expect(historico).toHaveLength(3);
    expect(historico[2].previousStage).toBe("VISITED");
    expect(historico[2].newStage).toBe("REJECTED");
    const atual = await buscarInteresse(cenario.organization.id, interesse.personId, interesse.propertyId);
    expect(historico[2].changedAt.getTime()).toBe(atual!.closedAt!.getTime());
  });

  test("DR) idempotência: marcarInteresseComoGanho num interesse já WON não cria novo history (zero write no branch ja_fechado)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { interesse } = await prepararInteresseNoStage(cenario, "PROPOSAL");
    await marcarGanho(interesse.id);
    // 1 da criação + 1 do setup (INTERESTED -> PROPOSAL) + 1 do fechamento
    // (PROPOSAL -> WON).
    expect(await historicoDe(cenario.organization.id, interesse.id)).toHaveLength(3);

    await marcarGanho(interesse.id);

    expect(await historicoDe(cenario.organization.id, interesse.id)).toHaveLength(3);
  });

  test("DS) transição inválida (marcarInteresseComoPerdido num WON) não cria history", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { interesse } = await prepararInteresseNoStage(cenario, "PROPOSAL");
    await marcarGanho(interesse.id);
    expect(await historicoDe(cenario.organization.id, interesse.id)).toHaveLength(3);

    const resultado = await marcarPerdido(interesse.id);

    expect(resultado.success).toBe(false);
    expect(await historicoDe(cenario.organization.id, interesse.id)).toHaveLength(3);
  });

  test("DT) concorrência real: duas chamadas simultâneas de atualizarEstagioInteresse pro MESMO destino resultam em exatamente 1 PropertyInterestStageHistory (a que perde a corrida releva o stage já correto na retentativa e cai no ramo no-op)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { interesse } = await prepararInteresseNoStage(cenario, "INTERESTED");
    // 1 entrada já existe (history inicial da criação, null -> INTERESTED).
    expect(await historicoDe(cenario.organization.id, interesse.id)).toHaveLength(1);

    const [r1, r2] = await Promise.all([
      mudarEstagio(interesse.id, { stage: "PROPOSAL" }),
      mudarEstagio(interesse.id, { stage: "PROPOSAL" }),
    ]);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    const historico = await historicoDe(cenario.organization.id, interesse.id);
    expect(historico).toHaveLength(2);
    expect(historico[1].previousStage).toBe("INTERESTED");
    const atual = await buscarInteresse(cenario.organization.id, interesse.personId, interesse.propertyId);
    expect(historico[1].newStage).toBe(atual?.stage);
  });

  test("DU) concorrência real: duas chamadas simultâneas de marcarInteresseComoGanho resultam em exatamente 1 PropertyInterestStageHistory (mesmo racional de DF)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { interesse } = await prepararInteresseNoStage(cenario, "INTERESTED");

    await Promise.all([marcarGanho(interesse.id), marcarGanho(interesse.id)]);

    // 1 da criação + exatamente 1 do fechamento vencedor.
    expect(await historicoDe(cenario.organization.id, interesse.id)).toHaveLength(2);
  });

  test("DV) concorrência real: marcarInteresseComoGanho x marcarInteresseComoPerdido simultâneos resultam em exatamente 1 PropertyInterestStageHistory total (mesmo racional de DG)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { interesse } = await prepararInteresseNoStage(cenario, "INTERESTED");

    await Promise.all([marcarGanho(interesse.id), marcarPerdido(interesse.id)]);

    // 1 da criação + exatamente 1 do fechamento vencedor.
    expect(await historicoDe(cenario.organization.id, interesse.id)).toHaveLength(2);
  });

  test("DW) tenant scoping obrigatório — leitura de PropertyInterestStageHistory sem organizationId explícito é recusada", async () => {
    await expect(prisma.propertyInterestStageHistory.findMany({})).rejects.toThrow(/organizationId/);
  });

  test("DX) PropertyInterestStageHistory nunca contém PII (sem nome/email/telefone/notes/título — só ids e enums)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({
      organizationId: cenario.organization.id,
      name: "Cliente Sigiloso Histórico",
      email: "sigiloso-historico@email.com",
      phone: "11966665555",
    });
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      status: "AVAILABLE",
      title: "Cobertura Sigilosa",
    });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = (await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id))!;

    await mudarEstagio(interesse.id, { stage: "PROPOSAL" });

    const historico = await historicoDe(cenario.organization.id, interesse.id);
    const serializado = JSON.stringify(historico);
    expect(serializado).not.toContain("Cliente Sigiloso Histórico");
    expect(serializado).not.toContain("sigiloso-historico@email.com");
    expect(serializado).not.toContain("11966665555");
    expect(serializado).not.toContain("Cobertura Sigilosa");
  });

  test("DY) ActivityLog continua sendo gravado normalmente ao lado do novo history — nenhuma regressão do comportamento pré-P.6", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const { interesse } = await prepararInteresseNoStage(cenario, "INTERESTED");

    await mudarEstagio(interesse.id, { stage: "PROPOSAL" });

    const log = await prisma.activityLog.findFirst({
      where: { organizationId: cenario.organization.id, entityId: interesse.id, action: "property_interest_stage_changed" },
    });
    expect(log?.payload).toEqual({ from: "INTERESTED", to: "PROPOSAL" });
    // 1 da criação (null -> INTERESTED) + 1 da transição sob teste.
    expect(await historicoDe(cenario.organization.id, interesse.id)).toHaveLength(2);
  });

  // ---------------------------------------------------------------------
  // Correção pós-auditoria do achado C (Fase P.6): criarInteressePessoa
  // agora grava um PropertyInterestStageHistory inicial (previousStage
  // null -> newStage INTERESTED) na mesma transação da criação. Continua
  // a mesma sequência de letras do arquivo (DZ em diante).
  // ---------------------------------------------------------------------

  test("DZ) criarInteressePessoa cria exatamente 1 PropertyInterestStageHistory inicial com previousStage null e newStage INTERESTED", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const historico = await historicoDe(cenario.organization.id, interesse!.id);
    expect(historico).toHaveLength(1);
    expect(historico[0].previousStage).toBeNull();
    expect(historico[0].newStage).toBe("INTERESTED");
    expect(historico[0].organizationId).toBe(cenario.organization.id);
    expect(historico[0].propertyInterestId).toBe(interesse!.id);
  });

  test("EA) changedAt do history inicial é exatamente o createdAt do PropertyInterest (instante real da criação, nunca um new Date() separado)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const historico = await historicoDe(cenario.organization.id, interesse!.id);
    expect(historico[0].changedAt.getTime()).toBe(interesse!.createdAt.getTime());
  });

  test("EB) novo PropertyInterest criado via criarInteressePessoa possui aging calculável enquanto permanece INTERESTED (contraste com legado, ver EC)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const item = colunas.INTERESTED.find((i) => i.id === interesse!.id);
    expect(item).toBeDefined();
    expect(item?.aging).not.toBeNull();
    expect(item?.aging).toMatch(/^Na etapa há/);
  });

  test("EC) PropertyInterest legado (criado fora da action, sem history) continua com aging null — distinção intencional preservada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    // create() direto via Prisma, bypassando criarInteressePessoa —
    // simula exatamente um registro anterior à P.6 (sem history nenhum).
    const legado = await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
    });
    expect(await historicoDe(cenario.organization.id, legado.id)).toHaveLength(0);

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const item = colunas.INTERESTED.find((i) => i.id === legado.id);
    expect(item?.aging).toBeNull();
  });

  test("ED) tenant isolation: history inicial de A nunca é retornado numa consulta escopada por B", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const historicoDeB = await prisma.propertyInterestStageHistory.findMany({
      where: { organizationId: cenarioB.organization.id, propertyInterestId: interesse!.id },
    });
    expect(historicoDeB).toHaveLength(0);
    expect(await historicoDe(cenario.organization.id, interesse!.id)).toHaveLength(1);
  });

  test("EE) duas criações concorrentes do mesmo relacionamento geram exatamente 1 PropertyInterestStageHistory — nunca duplicado, nunca órfão (mesma corrida de AJ, agora provando também o history)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await Promise.all([
      relacionar(pessoa.id, { propertyId: imovel.id }),
      relacionar(pessoa.id, { propertyId: imovel.id }),
    ]);

    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(interesse).not.toBeNull();
    const historico = await historicoDe(cenario.organization.id, interesse!.id);
    // Exatamente 1: nunca órfão (o PropertyInterest existe e tem history),
    // nunca duplicado (a tentativa que perdeu a corrida por P2002 nunca
    // chama propertyInterestStageHistory.create — cai direto no
    // findUniqueOrThrow de recuperação).
    expect(historico).toHaveLength(1);
    expect(historico[0].previousStage).toBeNull();
    expect(historico[0].newStage).toBe("INTERESTED");
  });

  test("EF) reenvio sequencial (idempotente) do mesmo relacionamento não duplica o history inicial", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await relacionar(pessoa.id, { propertyId: imovel.id });
    await relacionar(pessoa.id, { propertyId: imovel.id });

    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);
    expect(await historicoDe(cenario.organization.id, interesse!.id)).toHaveLength(1);
  });

  test("EG) ActivityLog property_interest_created continua com a mesma semântica pré-correção (entity/action/entityId, sem payload)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await relacionar(pessoa.id, { propertyId: imovel.id });
    const interesse = await buscarInteresse(cenario.organization.id, pessoa.id, imovel.id);

    const log = await prisma.activityLog.findFirst({
      where: { organizationId: cenario.organization.id, entity: "PropertyInterest", action: "property_interest_created" },
    });
    expect(log).not.toBeNull();
    expect(log?.entityId).toBe(interesse!.id);
    expect(log?.payload).toBeNull();

    const totalLogsCriacao = await prisma.activityLog.count({
      where: { organizationId: cenario.organization.id, action: "property_interest_created" },
    });
    expect(totalLogsCriacao).toBe(1);
  });
});

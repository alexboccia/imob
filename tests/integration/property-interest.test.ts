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
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

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
});

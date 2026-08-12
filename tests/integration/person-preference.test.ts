import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa } from "@/test/fixtures";

// salvarPreferenciaPessoa (src/app/app/clientes/actions.ts) importa
// @/lib/auth diretamente — mesma limitação de resolução de módulo já
// documentada nesta sessão (next-auth → next/server não resolve sob
// Vitest puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/auth";
import { salvarPreferenciaPessoa } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

function formData(campos: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    if (Array.isArray(valor)) {
      for (const item of valor) fd.append(chave, item);
    } else {
      fd.set(chave, valor);
    }
  }
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

async function salvar(pessoaId: string, campos: Record<string, string | string[]>) {
  return salvarPreferenciaPessoa(pessoaId, ESTADO_INICIAL_ACAO, formData(campos));
}

function criarTipoImovel(
  organizationId: string,
  name: string,
  category: "RESIDENTIAL" | "COMMERCIAL" = "RESIDENTIAL"
) {
  return prisma.propertyTypeOption.create({ data: { organizationId, name, category } });
}

function criarFeature(organizationId: string, name: string, category: "PROPERTY" | "CONDO") {
  return prisma.featureOption.create({ data: { organizationId, name, category } });
}

describe("salvarPreferenciaPessoa — preferências de imóvel (Fase C do CRM)", () => {
  let cenario: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  test("A) cria preferência para Person da própria Organization", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, {
      transactionType: "SALE",
      minPrice: "500000",
      maxPrice: "800000",
    });

    expect(resultado.success).toBe(true);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).not.toBeNull();
    expect(linha?.transactionType).toBe("SALE");
    expect(Number(linha?.minPrice)).toBe(500000);
    expect(Number(linha?.maxPrice)).toBe(800000);
  });

  test("B) atualiza preferência existente sem criar segunda linha", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    await salvar(pessoa.id, { minBedrooms: "2" });
    await salvar(pessoa.id, { minBedrooms: "3" });

    const total = await prisma.personPreference.count({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(total).toBe(1);

    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha?.minBedrooms).toBe(3);
  });

  test("C) Person sem preferência continua válida", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const encontrada = await prisma.person.findUnique({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
      include: { preference: true },
    });
    expect(encontrada).not.toBeNull();
    expect(encontrada?.preference).toBeNull();
  });

  test("D) Person da Organization A não pode receber preferência usando sessão da Organization B", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaDeA = await criarPessoa({ organizationId: cenario.organization.id });

    autenticarComo(cenarioB);
    const resultado = await salvar(pessoaDeA.id, { minBedrooms: "2" });

    expect(resultado.success).toBe(false);
    // Checa nas DUAS organizações — o ponto do teste é confirmar que
    // nenhuma linha foi criada em nenhum tenant, nem no de A (dono real
    // da Person) nem no de B (organização da sessão atacante).
    const naOrgA = await prisma.personPreference.count({
      where: { personId: pessoaDeA.id, organizationId: cenario.organization.id },
    });
    const naOrgB = await prisma.personPreference.count({
      where: { personId: pessoaDeA.id, organizationId: cenarioB.organization.id },
    });
    expect(naOrgA + naOrgB).toBe(0);
  });

  test("E) membro da Organization A não consegue visualizar/alterar preferência da Organization B", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaDeB = await criarPessoa({ organizationId: cenarioB.organization.id });

    autenticarComo(cenarioB);
    await salvar(pessoaDeB.id, { minBedrooms: "1", notes: "original da org B" });

    autenticarComo(cenario);
    const resultado = await salvar(pessoaDeB.id, { minBedrooms: "9", notes: "tentativa da org A" });

    expect(resultado.success).toBe(false);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoaDeB.id, organizationId: cenarioB.organization.id },
    });
    expect(linha?.minBedrooms).toBe(1);
    expect(linha?.notes).toBe("original da org B");
  });

  test("F) minPrice > maxPrice é rejeitado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, {
      transactionType: "SALE",
      minPrice: "800000",
      maxPrice: "500000",
    });

    expect(resultado.success).toBe(false);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("G) minArea > maxArea é rejeitado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { minArea: "120", maxArea: "70" });

    expect(resultado.success).toBe(false);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("H) valores negativos são rejeitados", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { minBedrooms: "-1" });

    expect(resultado.success).toBe(false);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("I) múltiplos bairros são persistidos corretamente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    await salvar(pessoa.id, { neighborhoods: ["Vila Mariana", "Moema", "Saúde"] });

    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha?.neighborhoods).toEqual(["Vila Mariana", "Moema", "Saúde"]);
  });

  test("J) múltiplos tipos de imóvel são persistidos corretamente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    await criarTipoImovel(cenario.organization.id, "Apartamento");
    await criarTipoImovel(cenario.organization.id, "Casa");
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    await salvar(pessoa.id, { propertyTypes: ["Apartamento", "Casa"] });

    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha?.propertyTypes).toEqual(["Apartamento", "Casa"]);
  });

  test("K) notes da preferência não altera Person.notes", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await prisma.person.create({
      data: {
        organizationId: cenario.organization.id,
        name: "Pessoa com observação",
        notes: "observação geral sobre a pessoa",
        roles: ["LEAD"],
      },
    });

    await salvar(pessoa.id, { notes: "prefere andar alto e condomínio com lazer" });

    const pessoaAtualizada = await prisma.person.findUnique({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(pessoaAtualizada?.notes).toBe("observação geral sobre a pessoa");

    const preferencia = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(preferencia?.notes).toBe("prefere andar alto e condomínio com lazer");
  });

  test("L) editar preferência não altera roles/pipelineStage/source/assignedMemberId/email/phone de Person", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await prisma.person.create({
      data: {
        organizationId: cenario.organization.id,
        name: "Pessoa completa",
        email: "pessoa@email.com",
        phone: "11999998888",
        roles: ["LEAD", "CLIENT"],
        pipelineStage: "CONTACTED",
        source: "REFERRAL",
        assignedMemberId: cenario.membro.id,
      },
    });

    await salvar(pessoa.id, { minBedrooms: "2", transactionType: "RENT" });

    const pessoaAtualizada = await prisma.person.findUnique({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(pessoaAtualizada?.roles).toEqual(["LEAD", "CLIENT"]);
    expect(pessoaAtualizada?.pipelineStage).toBe("CONTACTED");
    expect(pessoaAtualizada?.source).toBe("REFERRAL");
    expect(pessoaAtualizada?.assignedMemberId).toBe(cenario.membro.id);
    expect(pessoaAtualizada?.email).toBe("pessoa@email.com");
    expect(pessoaAtualizada?.phone).toBe("11999998888");
  });

  test("M) organizationId nunca vem do formulário", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, {
      organizationId: "valor-forjado-que-nao-existe",
      minBedrooms: "2",
    });

    expect(resultado.success).toBe(true);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).not.toBeNull();
    expect(linha?.organizationId).toBe(cenario.organization.id);
  });

  test("N) tentativa com personId inexistente é tratada de forma segura", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);

    const resultado = await salvar("id-que-nao-existe", { minBedrooms: "2" });

    expect(resultado.success).toBe(false);
    const total = await prisma.personPreference.count({
      where: { personId: "id-que-nao-existe", organizationId: cenario.organization.id },
    });
    expect(total).toBe(0);
  });

  test("O) entitlement/permissão do CRM continua sendo respeitado", async () => {
    // criarCenario() sem "crm" na lista de módulos — default é ["core","properties"].
    cenario = await criarCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { minBedrooms: "2" });

    expect(resultado.success).toBe(false);
    expect(resultado.message).toMatch(/CRM/);
    const total = await prisma.personPreference.count({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(total).toBe(0);
  });

  test("P) desiredPropertyFeatures persiste separadamente de desiredCondoFeatures", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    await criarFeature(cenario.organization.id, "Varanda", "PROPERTY");
    await criarFeature(cenario.organization.id, "Aceita pet", "PROPERTY");
    await criarFeature(cenario.organization.id, "Academia", "CONDO");
    await criarFeature(cenario.organization.id, "Piscina", "CONDO");
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    await salvar(pessoa.id, {
      desiredPropertyFeatures: ["Varanda", "Aceita pet"],
      desiredCondoFeatures: ["Academia", "Piscina"],
    });

    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha?.desiredPropertyFeatures).toEqual(["Varanda", "Aceita pet"]);
    expect(linha?.desiredCondoFeatures).toEqual(["Academia", "Piscina"]);
  });

  test("Q) características de condomínio não aparecem no array de imóvel e vice-versa", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    await criarFeature(cenario.organization.id, "Varanda", "PROPERTY");
    await criarFeature(cenario.organization.id, "Academia", "CONDO");
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    await salvar(pessoa.id, {
      desiredPropertyFeatures: ["Varanda"],
      desiredCondoFeatures: ["Academia"],
    });

    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha?.desiredPropertyFeatures).not.toContain("Academia");
    expect(linha?.desiredCondoFeatures).not.toContain("Varanda");
  });

  test("R) SALE_AND_RENT não é aceito pela validação da preferência", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { transactionType: "SALE_AND_RENT" });

    expect(resultado.success).toBe(false);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("S) organizationId enviado artificialmente no FormData (id real de outra org) é ignorado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, {
      organizationId: cenarioB.organization.id,
      minBedrooms: "4",
    });

    expect(resultado.success).toBe(true);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha?.organizationId).toBe(cenario.organization.id);
    const naOutraOrg = await prisma.personPreference.count({
      where: { personId: pessoa.id, organizationId: cenarioB.organization.id },
    });
    expect(naOutraOrg).toBe(0);
  });

  test("T) tentativa cross-tenant via upsert não altera preferência existente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaDeA = await criarPessoa({ organizationId: cenario.organization.id });

    autenticarComo(cenario);
    await salvar(pessoaDeA.id, { transactionType: "SALE", minBedrooms: "2", maxPrice: "700000" });
    const antes = await prisma.personPreference.findUnique({
      where: { personId: pessoaDeA.id, organizationId: cenario.organization.id },
    });

    autenticarComo(cenarioB);
    await salvar(pessoaDeA.id, { transactionType: "SALE", minBedrooms: "99", maxPrice: "1" });

    const depois = await prisma.personPreference.findUnique({
      where: { personId: pessoaDeA.id, organizationId: cenario.organization.id },
    });
    expect(depois?.minBedrooms).toBe(antes?.minBedrooms);
    expect(depois?.maxPrice?.toString()).toBe(antes?.maxPrice?.toString());
  });

  test("U) segunda gravação para a mesma Person atualiza a mesma PersonPreference, mantendo relação 1:1", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    await salvar(pessoa.id, { cities: ["São Paulo"] });
    const primeira = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });

    await salvar(pessoa.id, { cities: ["Campinas"] });
    const segunda = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });

    expect(segunda?.personId).toBe(primeira?.personId);
    expect(segunda?.cities).toEqual(["Campinas"]);
    const total = await prisma.personPreference.count({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(total).toBe(1);
  });

  test("V) notes acima de 2.000 caracteres é rejeitado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { notes: "a".repeat(2001) });

    expect(resultado.success).toBe(false);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("W) limites máximos dos arrays são respeitados", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, {
      propertyTypes: Array.from({ length: 21 }, (_, i) => `Tipo ${i}`),
    });

    expect(resultado.success).toBe(false);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("X) propertyType inexistente no catálogo da organização é rejeitado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { propertyTypes: ["Tipo Inexistente"] });

    expect(resultado.success).toBe(false);
    expect(resultado.fieldErrors?.propertyTypes).toBeTruthy();
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("Y) desiredPropertyFeature inexistente no catálogo é rejeitado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, {
      desiredPropertyFeatures: ["Característica Inexistente"],
    });

    expect(resultado.success).toBe(false);
    expect(resultado.fieldErrors?.desiredPropertyFeatures).toBeTruthy();
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("Z) desiredCondoFeature inexistente no catálogo é rejeitado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, {
      desiredCondoFeatures: ["Característica Inexistente"],
    });

    expect(resultado.success).toBe(false);
    expect(resultado.fieldErrors?.desiredCondoFeatures).toBeTruthy();
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("AA) bairros duplicados (case-insensitive) persistem como uma única entrada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, {
      neighborhoods: ["Moema", "moema", " Moema "],
    });

    expect(resultado.success).toBe(true);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha?.neighborhoods).toEqual(["Moema"]);
  });

  test("AB) cidades duplicadas (case-insensitive) persistem como uma única entrada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, {
      cities: ["São Paulo", "SÃO PAULO", " são paulo "],
    });

    expect(resultado.success).toBe(true);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha?.cities).toEqual(["São Paulo"]);
  });

  test("AR) preço sem finalidade é rejeitado — erro aparece em transactionType", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { minPrice: "500000" });

    expect(resultado.success).toBe(false);
    expect(resultado.fieldErrors?.transactionType).toBeTruthy();
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("AS) minPrice=0 com finalidade continua válido e é persistido", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { transactionType: "SALE", minPrice: "0" });

    expect(resultado.success).toBe(true);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(Number(linha?.minPrice)).toBe(0);
  });

  test("AT) maxPrice=0 com finalidade continua válido e é persistido", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { transactionType: "SALE", maxPrice: "0" });

    expect(resultado.success).toBe(true);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(Number(linha?.maxPrice)).toBe(0);
  });

  test("BC) desiredPropertyFeatures duplicadas (case-insensitive) persistem como uma única entrada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    await criarFeature(cenario.organization.id, "Varanda", "PROPERTY");
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, {
      desiredPropertyFeatures: ["Varanda", "varanda", " VARANDA "],
    });

    expect(resultado.success).toBe(true);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha?.desiredPropertyFeatures).toEqual(["Varanda"]);
  });

  test("BD) desiredCondoFeatures duplicadas (case-insensitive) persistem como uma única entrada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    await criarFeature(cenario.organization.id, "Academia", "CONDO");
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, {
      desiredCondoFeatures: ["Academia", "academia", " ACADEMIA "],
    });

    expect(resultado.success).toBe(true);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha?.desiredCondoFeatures).toEqual(["Academia"]);
  });

  test("AC) minBedrooms/minBathrooms/minParkingSpots decimais são rejeitados", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const r1 = await salvar(pessoa.id, { minBedrooms: "2.5" });
    expect(r1.success).toBe(false);

    const r2 = await salvar(pessoa.id, { minBathrooms: "1.5" });
    expect(r2.success).toBe(false);

    const r3 = await salvar(pessoa.id, { minParkingSpots: "3.5" });
    expect(r3.success).toBe(false);

    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("AD) deletar Person remove PersonPreference automaticamente (FK ON DELETE CASCADE)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    await salvar(pessoa.id, { minBedrooms: "2" });
    const antes = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(antes).not.toBeNull();

    await prisma.person.delete({ where: { id: pessoa.id, organizationId: cenario.organization.id } });

    const depois = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(depois).toBeNull();
  });

  test("AE) propertyType cadastrado só em outra Organization é rejeitado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    await criarTipoImovel(cenarioB.organization.id, "Apartamento");
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { propertyTypes: ["Apartamento"] });

    expect(resultado.success).toBe(false);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("AF) FeatureOption PROPERTY cadastrada só em outra Organization é rejeitada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    await criarFeature(cenarioB.organization.id, "Varanda", "PROPERTY");
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { desiredPropertyFeatures: ["Varanda"] });

    expect(resultado.success).toBe(false);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("AG) FeatureOption CONDO cadastrada só em outra Organization é rejeitada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    await criarFeature(cenarioB.organization.id, "Academia", "CONDO");
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const resultado = await salvar(pessoa.id, { desiredCondoFeatures: ["Academia"] });

    expect(resultado.success).toBe(false);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("AH) FeatureOption cadastrada só na categoria oposta é rejeitada (PROPERTY vs CONDO não se misturam)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    await criarFeature(cenario.organization.id, "Academia", "CONDO");
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    // "Academia" existe no catálogo da MESMA organização, mas só como
    // CONDO — enviá-la em desiredPropertyFeatures precisa ser rejeitado.
    const resultado = await salvar(pessoa.id, { desiredPropertyFeatures: ["Academia"] });

    expect(resultado.success).toBe(false);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha).toBeNull();
  });

  test("AI) organizationId forjado no FormData é ignorado mesmo na validação de catálogo", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    await criarTipoImovel(cenario.organization.id, "Apartamento");
    await criarTipoImovel(cenarioB.organization.id, "Cobertura");
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    // propertyTypes só é válido no catálogo da organização da SESSÃO
    // (cenario) — se a validação de catálogo usasse por engano o
    // organizationId forjado do FormData (cenarioB), "Apartamento" seria
    // rejeitado (só existe no catálogo de cenario) e "Cobertura" passaria
    // (só existe no catálogo de cenarioB, mas não foi enviado aqui).
    const resultado = await salvar(pessoa.id, {
      organizationId: cenarioB.organization.id,
      propertyTypes: ["Apartamento"],
    });

    expect(resultado.success).toBe(true);
    const linha = await prisma.personPreference.findUnique({
      where: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(linha?.organizationId).toBe(cenario.organization.id);
    expect(linha?.propertyTypes).toEqual(["Apartamento"]);
  });
});

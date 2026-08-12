import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import { buscarClientesCompativeis, buscarImoveisCompativeis } from "@/lib/property-matching";
import { obterProximaAcaoComercial } from "@/lib/proxima-acao-comercial";

// Fase G do CRM — próxima ação comercial. obterProximaAcaoComercial em si
// é pura e já exaustivamente testada sem banco (src/lib/proxima-acao-
// comercial.test.ts, cenários A–K). Este arquivo testa só a FIAÇÃO nova:
// os dados que alimentam a função (Property.status, PropertyInterest.stage)
// chegam corretamente através das queries reais, e de forma consistente
// nos dois sentidos do matching (Fases E e F) — não a matemática da
// função, que não muda dependendo de quem a chama.
describe("Próxima ação comercial — fiação de dados (Prisma + tenant)", () => {
  type Cenario = Awaited<ReturnType<typeof criarCenario>>;
  let cenario: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  test("Property.status chega corretamente no mesmo select usado pela ficha do cliente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "SOLD" });
    await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "VISITED",
      },
    });

    // Mesmo shape de query de src/app/app/clientes/[id]/page.tsx — só
    // acrescenta status ao select já existente, sem query nova.
    const resultado = await prisma.person.findUnique({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
      include: {
        propertyInterests: {
          where: { organizationId: cenario.organization.id },
          include: {
            property: { select: { id: true, title: true, price: true, rentPrice: true, status: true } },
          },
        },
      },
    });

    const interesse = resultado?.propertyInterests[0];
    expect(interesse?.property.status).toBe("SOLD");
    expect(obterProximaAcaoComercial(interesse!.stage, interesse!.property.status)).toEqual({
      key: "INDISPONIVEL",
      label: "Imóvel indisponível",
      ativa: false,
    });
  });

  test("mesma combinação stage+status produz a mesma próxima ação nos dois sentidos do matching (Cliente→Imóvel e Imóvel→Cliente)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    // Preferência neutra (sem nenhum critério) — só precisa bater nos
    // hard filters (todos inativos) pra aparecer nos dois sentidos.
    await prisma.personPreference.create({
      data: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "VISIT_SCHEDULED",
      },
    });

    const direto = (await buscarImoveisCompativeis(cenario.organization.id, pessoa.id)).find(
      (r) => r.property.id === imovel.id
    );
    const reverso = (await buscarClientesCompativeis(cenario.organization.id, imovel.id)).recomendacoes.find(
      (r) => r.person.id === pessoa.id
    );

    expect(direto?.existingInterest?.stage).toBe("VISIT_SCHEDULED");
    expect(reverso?.existingInterest?.stage).toBe("VISIT_SCHEDULED");

    // Direção direta (buscarImoveisCompativeis): só recomenda Property já
    // AVAILABLE (pré-filtro SQL, Fase E) — mesmo racional já usado em
    // RecomendacaoImovelItem.tsx pra não precisar de propertyStatus.
    const acaoDireta = obterProximaAcaoComercial(direto!.existingInterest!.stage, "AVAILABLE");
    // Direção reversa (buscarClientesCompativeis): status real do imovel,
    // que aqui é o mesmo AVAILABLE (criado explicitamente com esse status
    // acima; criarImovel só retorna {id}, sem os demais campos).
    const acaoReversa = obterProximaAcaoComercial(reverso!.existingInterest!.stage, "AVAILABLE");

    expect(acaoReversa).toEqual(acaoDireta);
    expect(acaoDireta).toEqual({ key: "REALIZAR_VISITA", label: "Realizar visita", ativa: true });
  });

  test("cálculo da próxima ação não cria PropertyInterest, ActivityLog ou Interaction", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await prisma.personPreference.create({
      data: { personId: pessoa.id, organizationId: cenario.organization.id },
    });
    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "PROPOSAL" },
    });

    // Duas chamadas seguidas simulando "abrir a página" + "recarregar" nos
    // dois sentidos — obterProximaAcaoComercial em si não toca Prisma
    // (confirmado por leitura de código e pelos testes puros), mas esta
    // prova cobre o caminho completo de orquestração + cálculo.
    for (let i = 0; i < 2; i++) {
      await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
      await buscarClientesCompativeis(cenario.organization.id, imovel.id);
      obterProximaAcaoComercial("PROPOSAL", "AVAILABLE");
    }

    const totalInteresse = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    const totalLog = await prisma.activityLog.count({ where: { organizationId: cenario.organization.id } });
    const totalInteracao = await prisma.interaction.count({ where: { organizationId: cenario.organization.id } });

    expect(totalInteresse).toBe(1); // só o que já existia antes, nenhum novo
    expect(totalLog).toBe(0);
    expect(totalInteracao).toBe(0);
  });

  // Cross-tenant e entitlement CRM: obterProximaAcaoComercial não introduz
  // nenhuma query nova (recebe stage/status já carregados pelas queries
  // existentes) — a proteção cross-tenant e de entitlement continua
  // sendo inteiramente responsabilidade de buscarImoveisCompativeis/
  // buscarClientesCompativeis/salvarPreferenciaPessoa/criarInteressePessoa,
  // já exaustivamente cobertos nas suítes das Fases D/E/F (não duplicado
  // aqui — ver property-interest.test.ts, property-matching.test.ts,
  // property-matching-reverso.test.ts, todos intactos e passando).
});

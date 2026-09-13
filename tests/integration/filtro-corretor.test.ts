import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario } from "@/test/fixtures";
import { resolverCorretorDoFiltro } from "@/lib/filtros-imoveis-data";

// =======================================================================
// Quem o filtro ?corretor= pode representar
// =======================================================================
// Esta é a barreira de PRIVACIDADE da faceta, e por isso é testada
// contra o banco de verdade: o portão é `publicProfileEnabled`, a busca
// nasce escopada na organização, e um id que não passa por ambos não
// vira filtro nenhum.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

describe("resolverCorretorDoFiltro", () => {
  let cenarioA: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  async function publicar(membroId: string, publicado = true) {
    await prisma.organizationMember.update({
      where: { id: membroId },
      data: { publicProfileEnabled: publicado },
    });
  }

  test("membro publicado da própria organização resolve, com nome", async () => {
    cenarioA = await criarCenario();
    await publicar(cenarioA.membro.id);

    const corretor = await resolverCorretorDoFiltro(
      cenarioA.organization.id,
      cenarioA.membro.id
    );
    expect(corretor?.id).toBe(cenarioA.membro.id);
    expect(corretor?.nome).toBeTruthy();
  });

  test("membro SEM opt-in não é filtrável — a mesma regra da rota do perfil", async () => {
    cenarioA = await criarCenario();
    // Nasce despublicado; nada além do opt-in publica alguém.
    expect(
      await resolverCorretorDoFiltro(cenarioA.organization.id, cenarioA.membro.id)
    ).toBeNull();
  });

  test("despublicar tira o corretor da faceta na requisição seguinte", async () => {
    cenarioA = await criarCenario();
    await publicar(cenarioA.membro.id);
    expect(
      await resolverCorretorDoFiltro(cenarioA.organization.id, cenarioA.membro.id)
    ).not.toBeNull();

    await publicar(cenarioA.membro.id, false);
    // Sem cache no caminho: a associação pública morre junto com o
    // opt-out, e não cinco minutos depois.
    expect(
      await resolverCorretorDoFiltro(cenarioA.organization.id, cenarioA.membro.id)
    ).toBeNull();
  });

  test("IDOR: id de membro publicado de OUTRO tenant não resolve aqui", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    await publicar(cenarioB.membro.id);

    // O membro existe e está publicado — só que não nesta organização.
    expect(
      await resolverCorretorDoFiltro(cenarioA.organization.id, cenarioB.membro.id)
    ).toBeNull();
    // E continua resolvendo no tenant dele: a barreira é o escopo, não
    // uma quebra geral.
    expect(
      await resolverCorretorDoFiltro(cenarioB.organization.id, cenarioB.membro.id)
    ).not.toBeNull();
  });

  test("id inexistente resolve para nada, sem erro", async () => {
    cenarioA = await criarCenario();
    expect(
      await resolverCorretorDoFiltro(cenarioA.organization.id, "cmzzzzzzzzzzzzzzzzzzzzzzz")
    ).toBeNull();
  });

  test("não carrega dado privado: o retorno é id e nome, e mais nada", async () => {
    cenarioA = await criarCenario();
    await publicar(cenarioA.membro.id);
    const corretor = await resolverCorretorDoFiltro(
      cenarioA.organization.id,
      cenarioA.membro.id
    );
    expect(Object.keys(corretor!).sort()).toEqual(["id", "nome"]);
  });
});

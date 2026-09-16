import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import type { OpcaoEmpreendimento } from "@/lib/empreendimento";

// =======================================================================
// Empreendimento — CONSULTAS (Fase 38)
// =======================================================================
// Separado de empreendimento.ts porque aquele módulo é importado pelo
// formulário de imóvel (Client Component) e não pode arrastar Prisma
// para o bundle do navegador — mesma separação de vitrine-home /
// vitrine-home-consultas e de proposta-negociacao.

/** Um empreendimento na tela de gestão, com quantas unidades já tem. */
export type EmpreendimentoDaLista = OpcaoEmpreendimento & {
  /** Contagem de TODAS as unidades vinculadas, não só as públicas: é
   *  gestão, e o gestor precisa ver rascunho e vendido também. */
  unidades: number;
  criadoEmISO: string;
};

// A listagem administrativa. Ordem alfabética — é uma lista de escolha,
// e o gestor procura por nome, não por data.
export async function listarEmpreendimentos(
  organizationId: string
): Promise<EmpreendimentoDaLista[]> {
  return withOrganization(organizationId, async () => {
    const linhas = await prisma.development.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        // Contagem agregada na MESMA consulta — nunca uma query por
        // linha da lista.
        _count: { select: { properties: true } },
      },
    });
    return linhas.map((l) => ({
      id: l.id,
      nome: l.name,
      unidades: l._count.properties,
      criadoEmISO: l.createdAt.toISOString(),
    }));
  });
}

// As opções do seletor no formulário de imóvel. Só id e nome: o
// formulário não precisa de contagem, e mandar menos para o cliente é o
// padrão do projeto.
export async function listarOpcoesEmpreendimento(
  organizationId: string
): Promise<OpcaoEmpreendimento[]> {
  return withOrganization(organizationId, async () => {
    const linhas = await prisma.development.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return linhas.map((l) => ({ id: l.id, nome: l.name }));
  });
}

/**
 * Valida que o empreendimento existe NESTA organização.
 *
 * O id chega do formulário, então é input do navegador como qualquer
 * outro: o organizationId vai no WHERE, nunca numa checagem posterior.
 * Um id de outro tenant simplesmente não casa — e a unidade não é
 * vinculada.
 */
export async function empreendimentoDaOrganizacao(
  organizationId: string,
  developmentId: string
): Promise<boolean> {
  return withOrganization(organizationId, async () => {
    const achado = await prisma.development.findFirst({
      where: { id: developmentId, organizationId },
      select: { id: true },
    });
    return achado !== null;
  });
}

// -----------------------------------------------------------------------
// As outras unidades do mesmo empreendimento — consulta PÚBLICA
// -----------------------------------------------------------------------
/** Quantas unidades a ficha mostra. */
export const LIMITE_OUTRAS_UNIDADES = 4;

export type UnidadeDoEmpreendimento = Awaited<
  ReturnType<typeof buscarOutrasUnidades>
>[number];

/**
 * Outras unidades PÚBLICAS do mesmo empreendimento.
 *
 * Os quatro filtros são obrigatórios e todos vão no banco:
 *   organizationId  o empreendimento nunca atravessa tenant
 *   developmentId   pertencimento real, não semelhança
 *   id: { not }     nunca a unidade que o visitante já está vendo
 *   status          a MESMA política pública do resto do site
 *
 * `status: "AVAILABLE"` não é uma regra nova: é exatamente a que a
 * listagem pública (/imoveis) e os imóveis próximos já aplicam. Um
 * imóvel vendido, reservado, rascunho ou inativo não é uma unidade que
 * o visitante possa comprar, e mostrá-lo aqui seria oferecer o que não
 * está à venda.
 *
 * LIMITE NO BANCO: `take` = limite + 1. A unidade extra nunca é
 * renderizada — serve só para a tela saber se existem mais do que cabem,
 * sem carregar o empreendimento inteiro para contar em JS.
 *
 * ORDENAÇÃO DETERMINÍSTICA e neutra: `code` é o número sequencial do
 * imóvel na organização (autoincrement), então a ordem é a de cadastro e
 * nunca muda entre dois carregamentos. Nenhum ranking, nenhuma
 * recomendação — o produto não tem personalização e não vai fingir que
 * tem.
 */
export async function buscarOutrasUnidades(
  organizationId: string,
  developmentId: string,
  imovelAtualId: string,
  limite = LIMITE_OUTRAS_UNIDADES
) {
  return withOrganization(organizationId, async () => {
    return prisma.property.findMany({
      where: {
        organizationId,
        developmentId,
        id: { not: imovelAtualId },
        status: "AVAILABLE",
      },
      orderBy: { code: "asc" },
      take: limite + 1,
      // Só o que o card usa — a página pública é caminho de SEO e
      // performance, e trazer a Property inteira seria desperdício.
      select: {
        id: true,
        title: true,
        type: true,
        purpose: true,
        neighborhood: true,
        city: true,
        state: true,
        price: true,
        rentPrice: true,
        bedrooms: true,
        totalArea: true,
        bathrooms: true,
        parkingSpots: true,
        isLaunch: true,
        isFeatured: true,
        isOpportunity: true,
        // A foto de capa na MESMA consulta: nunca uma query por card.
        media: {
          where: { type: "PHOTO" },
          orderBy: [{ isCover: "desc" }, { order: "asc" }],
          take: 1,
          select: { url: true },
        },
      },
    });
  });
}

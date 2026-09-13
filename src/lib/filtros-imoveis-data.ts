import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tagFacetas } from "@/lib/cache-tags";
import { nomePublicoDoCorretor } from "@/lib/perfil-publico-corretor";

export type TipoComCategoria = {
  nome: string;
  categoria: "RESIDENTIAL" | "COMMERCIAL" | null;
};

// Cidade é sempre carregada junto — o autocomplete de bairro da Home
// (PainelBuscaHome) filtra localmente por cidade selecionada sem round-trip
// nenhum, então precisa saber a que cidade cada bairro pertence (o mesmo
// nome de bairro poderia, em tese, existir em duas cidades do mesmo
// tenant).
export type BairroComCidade = {
  nome: string;
  cidade: string;
};

// Exportada (só ela, não o wrapper cacheado abaixo) pra permitir testar a
// query real de tenant isolation/visibilidade pública sem precisar mockar
// unstable_cache (que exige contexto de requisição do Next.js — ver
// tests/integration/filtros-imoveis-data.test.ts).
export async function buscarDadosFiltrosSemCache(organizationId: string) {
  const [
    bairrosDisponiveis,
    cidadesDisponiveis,
    tiposDisponiveis,
    imoveisComCaracteristicas,
    catalogoTipos,
  ] = await Promise.all([
    prisma.property.findMany({
      where: { organizationId, status: "AVAILABLE" },
      select: { neighborhood: true, city: true },
      distinct: ["neighborhood", "city"],
      orderBy: { neighborhood: "asc" },
    }),
    prisma.property.findMany({
      where: { organizationId, status: "AVAILABLE" },
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" },
    }),
    prisma.property.findMany({
      where: { organizationId, status: "AVAILABLE" },
      select: { type: true },
      distinct: ["type"],
      orderBy: { type: "asc" },
    }),
    prisma.property.findMany({
      where: { organizationId, status: "AVAILABLE" },
      select: { propertyFeatures: true, condoFeatures: true },
    }),
    prisma.propertyTypeOption.findMany({ where: { organizationId } }),
  ]);

  const categoriaPorNome = new Map(
    catalogoTipos.map((t) => [t.name, t.category] as const)
  );

  const tipos: TipoComCategoria[] = tiposDisponiveis.map((t) => ({
    nome: t.type,
    categoria: categoriaPorNome.get(t.type) ?? null,
  }));

  const caracteristicasEmUso = new Set<string>();
  for (const imovel of imoveisComCaracteristicas) {
    imovel.propertyFeatures.forEach((c) => caracteristicasEmUso.add(c));
    imovel.condoFeatures.forEach((c) => caracteristicasEmUso.add(c));
  }

  return {
    bairros: bairrosDisponiveis.map(
      (b): BairroComCidade => ({ nome: b.neighborhood, cidade: b.city })
    ),
    cidades: cidadesDisponiveis.map((c) => c.city),
    tipos,
    caracteristicas: Array.from(caracteristicasEmUso).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    ),
  };
}

// Facetas de filtro (cidades/bairros/tipos/características em uso) —
// recalculadas hoje em toda visita à home e à listagem pública, varrendo
// todos os imóveis disponíveis. Cacheadas por organização, com dupla
// garantia de atualização: invalidação explícita (updateTag) sempre que
// um imóvel ou o catálogo de tipos/características muda, e um TTL de 5
// minutos como rede de segurança caso algum ponto de mutação futuro
// esqueça de invalidar.
export async function buscarDadosFiltros(organizationId: string) {
  return unstable_cache(
    buscarDadosFiltrosSemCache,
    ["dados-filtros-imoveis", organizationId],
    { tags: [tagFacetas(organizationId)], revalidate: 300 }
  )(organizationId);
}

// =======================================================================
// Faceta "imóveis deste corretor"
// =======================================================================
// Quem o filtro ?corretor= pode representar. A resposta é a MESMA regra
// da rota /corretores/{id}, e por isso passa pelo mesmo portão
// (nomePublicoDoCorretor): um membro sem opt-in não é filtrável, do
// mesmo jeito que não é visitável.
//
// Isso não é rigor decorativo. Sem esse portão, uma URL compartilhada
// continuaria dizendo "estes imóveis são deste profissional" DEPOIS de
// ele despublicar o perfil — a associação pública sobreviveria ao
// opt-out, que é exatamente o que a doutrina de publicação proíbe.
//
// A query nasce escopada em `organizationId`: nunca "acha o membro e
// depois confere a organização". Um id de outro tenant não encontra
// ninguém aqui, e não há como ele virar filtro.
//
// Sem cache de propósito: despublicar precisa valer na próxima
// requisição, não daqui a cinco minutos.
//
// O select traz o mínimo — id e nome. Bio, foto, CRECI, telefone,
// e-mail e WhatsApp não são buscados porque a listagem não os mostra: o
// que não é lido não vaza.
export async function resolverCorretorDoFiltro(
  organizationId: string,
  membroId: string
): Promise<{ id: string; nome: string } | null> {
  const membro = await prisma.organizationMember.findFirst({
    where: { id: membroId, organizationId, publicProfileEnabled: true },
    select: { id: true, publicProfileEnabled: true, user: { select: { name: true } } },
  });
  const nome = nomePublicoDoCorretor(membro);
  return membro && nome ? { id: membro.id, nome } : null;
}

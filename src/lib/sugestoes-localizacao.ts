import { prisma } from "@/lib/prisma";

function ordenarPtBr(valores: string[]) {
  return [...valores].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Sugestões de cidade/bairro pra PersonPreference — reaproveita os valores
// já cadastrados em Property desta organização (mesma fonte de dado do
// datalist de CamposEndereco.tsx), sem tabela City/Neighborhood nova e sem
// depender da API do IBGE (que lista o Brasil inteiro, não só o que já é
// relevante pra esta organização).
export async function buscarSugestoesLocalizacao(organizationId: string) {
  const [cidades, bairros] = await Promise.all([
    prisma.property.findMany({
      where: { organizationId },
      select: { city: true },
      distinct: ["city"],
    }),
    prisma.property.findMany({
      where: { organizationId },
      select: { neighborhood: true },
      distinct: ["neighborhood"],
    }),
  ]);

  return {
    cidades: ordenarPtBr(cidades.map((c) => c.city)),
    bairros: ordenarPtBr(bairros.map((b) => b.neighborhood)),
  };
}

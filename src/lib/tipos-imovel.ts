import { prisma } from "@/lib/prisma";

function ordenarPtBr(nomes: string[]) {
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function buscarOpcoesTiposImovel(organizationId: string) {
  const opcoes = await prisma.propertyTypeOption.findMany({ where: { organizationId } });

  return {
    opcoesResidencial: ordenarPtBr(
      opcoes.filter((o) => o.category === "RESIDENTIAL").map((o) => o.name)
    ),
    opcoesComercial: ordenarPtBr(
      opcoes.filter((o) => o.category === "COMMERCIAL").map((o) => o.name)
    ),
  };
}

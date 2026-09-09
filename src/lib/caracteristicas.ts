import { prisma } from "@/lib/prisma";
import { ordenarPtBr } from "@/lib/texto";

export async function buscarOpcoesCaracteristicas(organizationId: string) {
  const opcoes = await prisma.featureOption.findMany({ where: { organizationId } });

  return {
    opcoesImovel: ordenarPtBr(
      opcoes.filter((o) => o.category === "PROPERTY").map((o) => o.name)
    ),
    opcoesCondominio: ordenarPtBr(
      opcoes.filter((o) => o.category === "CONDO").map((o) => o.name)
    ),
  };
}

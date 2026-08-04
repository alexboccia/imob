import { prisma } from "@/lib/prisma";

function ordenarPtBr(nomes: string[]) {
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function buscarOpcoesCaracteristicas() {
  const opcoes = await prisma.caracteristicaOpcao.findMany();

  return {
    opcoesImovel: ordenarPtBr(
      opcoes.filter((o) => o.categoria === "IMOVEL").map((o) => o.nome)
    ),
    opcoesCondominio: ordenarPtBr(
      opcoes.filter((o) => o.categoria === "CONDOMINIO").map((o) => o.nome)
    ),
  };
}

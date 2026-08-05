import { prisma } from "@/lib/prisma";

function ordenarPtBr(nomes: string[]) {
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function buscarOpcoesTiposImovel() {
  const opcoes = await prisma.tipoImovelOpcao.findMany();

  return {
    opcoesResidencial: ordenarPtBr(
      opcoes.filter((o) => o.categoria === "RESIDENCIAL").map((o) => o.nome)
    ),
    opcoesComercial: ordenarPtBr(
      opcoes.filter((o) => o.categoria === "COMERCIAL").map((o) => o.nome)
    ),
  };
}

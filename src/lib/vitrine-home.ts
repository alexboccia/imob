// =======================================================================
// Vitrine editorial da Home — regras PURAS
// =======================================================================
// Sem nenhum import de Prisma ou de contexto de tenant, de propósito:
// este módulo é consumido pelo formulário de imóvel, que é Client
// Component. Puxar o módulo de consultas para o bundle do cliente
// quebrava o build ("the chunking context does not support external
// modules: node:module") — e, mesmo que não quebrasse, levaria código
// de servidor para o navegador.
//
// As consultas vivem em vitrine-home-consultas.ts.

// Uma imobiliária escolhe até QUATRO imóveis para promover na página
// inicial, em ordem definida por ela. É seleção editorial, não
// heurística: nada aqui deriva de preço, data, acessos ou tipo.
//
// O conceito é DISTINTO de isFeatured/isLaunch/isOpportunity, que
// continuam sendo rótulos comerciais do imóvel (badge na ficha, filtro
// público, KPI). Um imóvel pode ser "Oportunidade" sem estar na vitrine,
// e vice-versa.

export const MAX_DESTAQUES_HOME = 4;

export const POSICOES_DESTAQUE = [1, 2, 3, 4] as const;
export type PosicaoDestaque = (typeof POSICOES_DESTAQUE)[number];

export function posicaoValida(valor: unknown): valor is PosicaoDestaque {
  return (
    typeof valor === "number" &&
    Number.isInteger(valor) &&
    (POSICOES_DESTAQUE as readonly number[]).includes(valor)
  );
}

export type OcupacaoVitrine = {
  posicao: PosicaoDestaque;
  imovel: { id: string; title: string } | null;
};


export type ResultadoSelecao =
  | { tipo: "ok" }
  | { tipo: "posicao_invalida" }
  | { tipo: "ocupada"; porTitulo: string };

// Interpreta o valor que veio do formulário. Separado da persistência
// porque é regra pura e testável: "" e "0" significam remover da
// vitrine; 1..4 são as únicas posições aceitas; qualquer outra coisa é
// recusada em vez de virar null silenciosamente — um valor inesperado
// não pode ser lido como "tire da vitrine".
export function interpretarPosicao(valor: FormDataEntryValue | null):
  | { valido: true; posicao: PosicaoDestaque | null }
  | { valido: false } {
  if (valor === null || valor === "" || valor === "0") return { valido: true, posicao: null };
  const numero = Number(valor);
  if (!posicaoValida(numero)) return { valido: false };
  return { valido: true, posicao: numero };
}

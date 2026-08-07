// Utilitários compartilhados de paginação server-side — usados por toda
// listagem administrativa (imóveis, clientes, usuários) e pela listagem
// pública de imóveis. Nada aqui confia em input do cliente sem validar:
// page/pageSize sempre saem clampados, nunca repassados crus pro Prisma.

export const PAGE_SIZE_PADRAO = 20;
export const PAGE_SIZE_MAXIMO = 100;

// Limite de profundidade: além de custar caro (OFFSET alto no Postgres
// precisa varrer e descartar todas as linhas anteriores), páginas muito
// profundas não têm uso legítimo numa listagem paginada por UI — é o tipo
// de parâmetro que só faz sentido pra scraping/abuso.
export const PAGINA_MAXIMA = 500;

export type ParametrosPaginacao = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

function paraInteiro(valor: string | undefined, padrao: number): number {
  if (!valor) return padrao;
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) ? n : padrao;
}

export function interpretarPaginacao(
  params: { page?: string; pageSize?: string },
  opcoes: { pageSizePadrao?: number; pageSizeMaximo?: number } = {}
): ParametrosPaginacao {
  const pageSizePadrao = opcoes.pageSizePadrao ?? PAGE_SIZE_PADRAO;
  const pageSizeMaximo = opcoes.pageSizeMaximo ?? PAGE_SIZE_MAXIMO;

  const pageBruto = paraInteiro(params.page, 1);
  const page = Math.min(Math.max(1, pageBruto), PAGINA_MAXIMA);

  const pageSizeBruto = paraInteiro(params.pageSize, pageSizePadrao);
  const pageSize = Math.min(Math.max(1, pageSizeBruto), pageSizeMaximo);

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function totalDePaginas(totalRegistros: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalRegistros / pageSize));
}

// Busca livre normalizada: trim + colapso de espaços + limite de tamanho.
// Um texto de busca absurdamente longo não é um caso de uso real — só
// aumenta o custo de um ILIKE '%...%' sem nenhum ganho, então é cortado.
const TAMANHO_MAXIMO_BUSCA = 100;

export function normalizarBusca(valor: string | undefined): string {
  if (!valor) return "";
  return valor.trim().replace(/\s+/g, " ").slice(0, TAMANHO_MAXIMO_BUSCA);
}

export type Ordenacao = { campo: string; direcao: "asc" | "desc" };

// `sort` chega como "campo:asc" ou "campo:desc". Só campos na allowlist são
// aceitos — index de ordenação em campo arbitrário poderia forçar um sort
// caro (sem índice) numa tabela grande; fora da allowlist, cai no padrão.
export function interpretarOrdenacao(
  sortParam: string | undefined,
  camposPermitidos: readonly string[],
  padrao: Ordenacao
): Ordenacao {
  if (!sortParam) return padrao;
  const [campo, direcao] = sortParam.split(":");
  if (!campo || !camposPermitidos.includes(campo)) return padrao;
  return { campo, direcao: direcao === "asc" ? "asc" : "desc" };
}

// `filters` chega como um JSON codificado na URL (?filters={"status":"AVAILABLE"}).
// Só chaves da allowlist e valores string simples são aceitos — protege
// contra filtro arbitrário/objeto profundo que vire um `where` caro ou
// inesperado.
export function interpretarFiltros<T extends string>(
  filtersParam: string | undefined,
  chavesPermitidas: readonly T[]
): Partial<Record<T, string>> {
  if (!filtersParam) return {};
  let bruto: unknown;
  try {
    bruto = JSON.parse(filtersParam);
  } catch {
    return {};
  }
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};

  const resultado: Partial<Record<T, string>> = {};
  for (const chave of chavesPermitidas) {
    const valor = (bruto as Record<string, unknown>)[chave];
    if (typeof valor === "string" && valor.trim()) {
      resultado[chave] = valor.trim().slice(0, TAMANHO_MAXIMO_BUSCA);
    }
  }
  return resultado;
}

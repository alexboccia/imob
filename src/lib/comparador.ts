import { formatarPreco, FINALIDADE_LABEL, formatarCodigoImovel } from "@/lib/format";
import { ordenarPtBr } from "@/lib/texto";

// =======================================================================
// Comparador de imóveis (Fase 59)
// =======================================================================
// Lógica PURA sobre imóveis já carregados: nenhuma consulta, nenhum
// estado, nenhum JSX. Fica fora do componente pelo mesmo motivo de
// caracteristicas-ficha.ts — a suíte unitária roda em `node` e só
// enxerga `src/**/*.test.ts`, então regra de comparação, ausência e
// "apenas diferenças" só é testável de verdade aqui.
//
// O QUE ESTE MÓDULO NÃO FAZ, e não deve passar a fazer: não elege
// vencedor, não pontua, não recomenda. Ele organiza os dados lado a lado
// e diz onde eles diferem; quem decide é quem está comprando.

/** Um imóvel na forma que a comparação consome. */
export type ImovelComparado = {
  id: string;
  titulo: string;
  codigo: number;
  tipo: string;
  finalidade: string;
  /** Rótulo da situação quando não está disponível (igual ao dos favoritos). */
  situacao: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  preco: number | null;
  precoAluguel: number | null;
  condominio: number | null;
  iptu: number | null;
  areaTotal: number | null;
  areaPrivativa: number | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  /** Características da unidade e do condomínio, já unidas. */
  caracteristicas: string[];
  empreendimento: string | null;
  lancamento: boolean;
  foto: string | null;
};

/** O que a tela mostra quando o imóvel não informou o dado. */
export const AUSENTE = "—";

/**
 * Um valor comparável: o que se COMPARA e o que se LÊ são coisas
 * diferentes. "R$ 320.000" e 320000 são o mesmo fato, e comparar o texto
 * renderizado faria a tela achar que dois imóveis iguais são diferentes
 * (e o contrário, quando duas formatações colidem).
 */
export type ValorComparado = {
  /** Usado para decidir igualdade. null = não informado. */
  bruto: string | number | boolean | null;
  /** Usado para exibir. */
  texto: string;
};

export type LinhaComparacao = {
  chave: string;
  rotulo: string;
  /** Características viram ✓/— em vez de texto. */
  tipo: "texto" | "booleano";
  valores: ValorComparado[];
};

export type GrupoComparacao = {
  chave: string;
  titulo: string;
  linhas: LinhaComparacao[];
};

// -----------------------------------------------------------------------
// Formatação de célula
// -----------------------------------------------------------------------
// Ausência é sempre a MESMA marca, em qualquer linha: um "—" em Preço e
// outro em IPTU significam a mesma coisa (o cadastro não informou), e
// inventar textos diferentes por campo só faria a tabela parecer ter
// mais informação do que tem.

function moeda(valor: number | null): ValorComparado {
  if (valor === null) return { bruto: null, texto: AUSENTE };
  // `formatarPreco` devolve "Consulte-nos" para ausência — aqui a
  // ausência já foi tratada acima, então ele só vê número.
  return { bruto: valor, texto: formatarPreco(valor) };
}

function area(valor: number | null): ValorComparado {
  if (valor === null || valor <= 0) return { bruto: null, texto: AUSENTE };
  return { bruto: valor, texto: `${valor.toLocaleString("pt-BR")} m²` };
}

function contagem(valor: number | null): ValorComparado {
  // Zero é ausência de fato no cadastro (mesma regra da ficha), mas na
  // comparação ele é informação: "0 vagas" distingue de "não informado".
  if (valor === null) return { bruto: null, texto: AUSENTE };
  return { bruto: valor, texto: valor.toLocaleString("pt-BR") };
}

function texto(valor: string | null): ValorComparado {
  const limpo = (valor ?? "").trim();
  if (!limpo) return { bruto: null, texto: AUSENTE };
  return { bruto: limpo, texto: limpo };
}

// -----------------------------------------------------------------------
// Preço por m²
// -----------------------------------------------------------------------
// BASE ÚNICA: preço de VENDA dividido pela ÁREA TOTAL.
//
// Uma base só é o ponto inteiro do indicador. Misturar bases entre
// colunas — área privativa numa, total na outra, ou preço de venda
// contra valor de aluguel — produziria números que parecem comparáveis
// e não são, que é pior do que não mostrar. Quando falta preço de venda
// ou área total, a célula é "—" e a comparação segue.
//
// Nunca é persistido: é derivado de dois campos que já existem.
export function precoPorMetro(imovel: ImovelComparado): number | null {
  if (imovel.preco === null || imovel.preco <= 0) return null;
  if (imovel.areaTotal === null || imovel.areaTotal <= 0) return null;
  return imovel.preco / imovel.areaTotal;
}

function celulaPrecoPorMetro(imovel: ImovelComparado): ValorComparado {
  const valor = precoPorMetro(imovel);
  if (valor === null) return { bruto: null, texto: AUSENTE };
  // Arredondado para comparar: centavos de R$/m² são ruído, e dois
  // imóveis com 5.000,00 e 5.000,004 não são "diferentes".
  const arredondado = Math.round(valor);
  return { bruto: arredondado, texto: `${formatarPreco(arredondado)}/m²` };
}

// -----------------------------------------------------------------------
// Montagem das linhas
// -----------------------------------------------------------------------

type DefinicaoLinha = {
  chave: string;
  rotulo: string;
  valor: (imovel: ImovelComparado) => ValorComparado;
};

const LINHAS_FINANCEIRO: DefinicaoLinha[] = [
  { chave: "preco", rotulo: "Preço", valor: (i) => moeda(i.preco) },
  { chave: "aluguel", rotulo: "Aluguel", valor: (i) => moeda(i.precoAluguel) },
  { chave: "preco-m2", rotulo: "Preço/m²", valor: celulaPrecoPorMetro },
  { chave: "condominio", rotulo: "Condomínio", valor: (i) => moeda(i.condominio) },
  { chave: "iptu", rotulo: "IPTU", valor: (i) => moeda(i.iptu) },
];

const LINHAS_ESTRUTURA: DefinicaoLinha[] = [
  { chave: "area-total", rotulo: "Área total", valor: (i) => area(i.areaTotal) },
  { chave: "area-privativa", rotulo: "Área privativa", valor: (i) => area(i.areaPrivativa) },
  { chave: "quartos", rotulo: "Quartos", valor: (i) => contagem(i.quartos) },
  { chave: "suites", rotulo: "Suítes", valor: (i) => contagem(i.suites) },
  { chave: "banheiros", rotulo: "Banheiros", valor: (i) => contagem(i.banheiros) },
  { chave: "vagas", rotulo: "Vagas", valor: (i) => contagem(i.vagas) },
];

const LINHAS_IDENTIFICACAO: DefinicaoLinha[] = [
  { chave: "codigo", rotulo: "Código", valor: (i) => texto(formatarCodigoImovel(i.codigo, null)) },
  { chave: "tipo", rotulo: "Tipo", valor: (i) => texto(i.tipo) },
  {
    chave: "finalidade",
    rotulo: "Finalidade",
    valor: (i) => texto(FINALIDADE_LABEL[i.finalidade] ?? i.finalidade),
  },
  { chave: "situacao", rotulo: "Situação", valor: (i) => texto(i.situacao ?? "Disponível") },
  { chave: "bairro", rotulo: "Bairro", valor: (i) => texto(i.bairro) },
  { chave: "cidade", rotulo: "Cidade", valor: (i) => texto(i.cidade) },
  {
    chave: "empreendimento",
    rotulo: "Empreendimento",
    valor: (i) => texto(i.empreendimento),
  },
  {
    chave: "lancamento",
    rotulo: "Lançamento",
    valor: (i) => ({ bruto: i.lancamento, texto: i.lancamento ? "Sim" : "Não" }),
  },
];

function linhasDe(definicoes: DefinicaoLinha[], imoveis: ImovelComparado[]): LinhaComparacao[] {
  return definicoes.map((d) => ({
    chave: d.chave,
    rotulo: d.rotulo,
    tipo: "texto" as const,
    valores: imoveis.map(d.valor),
  }));
}

/**
 * Uma linha por característica presente em ALGUM dos imóveis comparados,
 * com ✓ / — por coluna.
 *
 * Só aparecem características que existem no cadastro de alguém: o
 * comparador não inventa um catálogo nem afirma ausência de algo que
 * ninguém nomeou. Unidade e condomínio entram juntas porque, para quem
 * compara, "tem piscina" é a mesma pergunta — a distinção de origem
 * continua na ficha, que é onde ela significa algo.
 */
export function linhasCaracteristicas(imoveis: ImovelComparado[]): LinhaComparacao[] {
  const todas = ordenarPtBr([
    ...new Set(imoveis.flatMap((i) => i.caracteristicas.map((c) => c.trim()).filter(Boolean))),
  ]);
  return todas.map((nome) => ({
    chave: `caracteristica:${nome}`,
    rotulo: nome,
    tipo: "booleano" as const,
    valores: imoveis.map((i) => {
      const tem = i.caracteristicas.some((c) => c.trim() === nome);
      return { bruto: tem, texto: tem ? "Sim" : "Não" };
    }),
  }));
}

export function montarComparacao(imoveis: ImovelComparado[]): GrupoComparacao[] {
  const grupos: GrupoComparacao[] = [
    { chave: "financeiro", titulo: "Valores", linhas: linhasDe(LINHAS_FINANCEIRO, imoveis) },
    { chave: "estrutura", titulo: "Estrutura", linhas: linhasDe(LINHAS_ESTRUTURA, imoveis) },
    { chave: "identificacao", titulo: "Identificação", linhas: linhasDe(LINHAS_IDENTIFICACAO, imoveis) },
    {
      chave: "caracteristicas",
      titulo: "Características",
      linhas: linhasCaracteristicas(imoveis),
    },
  ];
  // Grupo sem linha nenhuma não vira título órfão (acontece com
  // características quando nenhum imóvel tem alguma cadastrada).
  return grupos.filter((g) => g.linhas.length > 0);
}

// -----------------------------------------------------------------------
// "Apenas diferenças"
// -----------------------------------------------------------------------

/**
 * Uma linha é IGUAL quando todos os imóveis comparados têm o mesmo
 * valor bruto — inclusive quando todos não informaram, que também é uma
 * não-diferença.
 *
 * Compara o BRUTO, nunca o texto: é o que faz 320000 e "R$ 320.000"
 * serem o mesmo fato, e o que impede duas ausências formatadas igual de
 * parecerem um dado.
 */
export function linhaTemDiferenca(linha: LinhaComparacao): boolean {
  if (linha.valores.length < 2) return false;
  const [primeiro, ...resto] = linha.valores;
  return resto.some((v) => v.bruto !== primeiro.bruto);
}

/** Os grupos com apenas as linhas que diferem; grupos vazios somem. */
export function apenasDiferencas(grupos: GrupoComparacao[]): GrupoComparacao[] {
  return grupos
    .map((g) => ({ ...g, linhas: g.linhas.filter(linhaTemDiferenca) }))
    .filter((g) => g.linhas.length > 0);
}

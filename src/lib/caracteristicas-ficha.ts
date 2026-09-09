// Itens das duas seções de características da ficha pública, como DADO.
//
// Fica separado do componente de propósito: a suíte unitária deste
// projeto roda em `environment: node` e só inclui `src/**/*.test.ts`
// (ver vitest.config.ts), então regra de pluralização, ordem e ausência
// só é testável de verdade se não estiver dentro do JSX. O componente
// (components/imovel/Caracteristicas.tsx) só desenha o que sai daqui.
//
// Duas regras de domínio herdadas e mantidas:
//
//  - contador em ZERO é AUSÊNCIA, não característica. "0 vaga" com
//    ícone ao lado é lido como o oposto do que o cadastro disse. Aqui a
//    guarda é `> 0`, mais forte que a antiga truthiness: um número
//    negativo que tenha entrado por importação também não vira linha.
//
//  - a classificação unidade/condomínio é DADO, nunca texto. Vem de qual
//    array da Property a característica ocupa (propertyFeatures /
//    condoFeatures), espelho de FeatureOption.category (PROPERTY|CONDO).
//    Nada aqui olha o NOME da característica pra decidir seção — o seed
//    tem "Piscina" cadastrada como característica da UNIDADE justamente
//    pra provar que nenhuma heurística de nome sobreviveria.

import { ordenarPtBr } from "@/lib/texto";

export type IconeFicha =
  | "area"
  | "quartos"
  | "suite"
  | "banheiro"
  | "vaga"
  | "catalogo";

export type ItemFicha = {
  // Estável e única dentro da seção: serve de `key` no React e de
  // âncora de teste sem depender do texto exibido.
  chave: string;
  texto: string;
  icone: IconeFicha;
};

export type DadosFichaUnidade = {
  totalArea: number | null;
  privateArea: number | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  propertyFeatures: string[];
};

// Pluralização em português, explícita: o plural do rótulo não é sempre
// "singular + s" ("vaga de garagem" -> "vagas de garagem"), então as duas
// formas são declaradas em vez de derivadas.
export function pluralizar(
  quantidade: number,
  singular: string,
  plural: string
): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

function preenchido(valor: number | null): valor is number {
  return valor !== null && valor > 0;
}

// Área usa separador decimal pt-BR: o campo é Float e um 58,5 m² escrito
// como "58.5 m²" é número de outro idioma numa página em português.
// Inteiro (o caso comum) sai idêntico ao que já saía.
function formatarArea(valor: number): string {
  return `${valor.toLocaleString("pt-BR")} m²`;
}

/**
 * Ordem determinística da unidade: área(s), quartos, suítes, banheiros,
 * vagas e, por último, as características configuráveis.
 *
 * "Quartos" — e não "dormitórios" — é a terminologia real do produto: é
 * o rótulo do campo no cadastro (ImovelForm), o rótulo do matching
 * (property-matching.ts), o do resumo da própria ficha e o nome do
 * parâmetro de busca pública. Trocar só aqui deixaria o site falando uma
 * língua e o painel outra.
 *
 * Suíte NÃO é agregada aos quartos ("3 quartos (1 suíte)"): o domínio
 * não tem invariante nenhuma que garanta suites <= bedrooms — são dois
 * campos numéricos opcionais e independentes (property-mapper.ts). Com
 * dados como bedrooms=2 e suites=3, a forma agregada afirmaria uma
 * continência que o cadastro nunca prometeu. Dois itens irmãos dizem a
 * verdade em qualquer combinação.
 */
export function montarItensUnidade(imovel: DadosFichaUnidade): ItemFicha[] {
  const itens: ItemFicha[] = [];

  if (preenchido(imovel.totalArea)) {
    itens.push({
      chave: "area-total",
      texto: `Área total: ${formatarArea(imovel.totalArea)}`,
      icone: "area",
    });
  }
  if (preenchido(imovel.privateArea)) {
    itens.push({
      chave: "area-privativa",
      texto: `Área privativa: ${formatarArea(imovel.privateArea)}`,
      icone: "area",
    });
  }
  if (preenchido(imovel.bedrooms)) {
    itens.push({
      chave: "quartos",
      texto: pluralizar(imovel.bedrooms, "quarto", "quartos"),
      icone: "quartos",
    });
  }
  if (preenchido(imovel.suites)) {
    itens.push({
      chave: "suites",
      texto: pluralizar(imovel.suites, "suíte", "suítes"),
      icone: "suite",
    });
  }
  if (preenchido(imovel.bathrooms)) {
    itens.push({
      chave: "banheiros",
      texto: pluralizar(imovel.bathrooms, "banheiro", "banheiros"),
      icone: "banheiro",
    });
  }
  if (preenchido(imovel.parkingSpots)) {
    itens.push({
      chave: "vagas",
      texto: pluralizar(
        imovel.parkingSpots,
        "vaga de garagem",
        "vagas de garagem"
      ),
      icone: "vaga",
    });
  }

  return [...itens, ...itensDeCatalogo(imovel.propertyFeatures)];
}

export function montarItensCondominio(condoFeatures: string[]): ItemFicha[] {
  return itensDeCatalogo(condoFeatures);
}

// A ordem do array em Property é a ordem em que o corretor marcou as
// caixas — estável no banco, mas sem significado editorial nenhum, e
// diferente entre dois imóveis com as mesmas características. O catálogo
// já tem uma ordem canônica (buscarOpcoesCaracteristicas ordena por
// pt-BR); reusá-la aqui faz a ficha exibir na mesma ordem em que o
// cadastro oferece. FeatureOption não tem sortOrder — se um dia tiver, é
// aqui que ele entra.
//
// O `Set` remove repetição exata dentro do MESMO array (só chegaria por
// importação, já que o formulário é de caixas de seleção) — sem isso
// duas linhas iguais colidiriam na `key` do React.
function itensDeCatalogo(nomes: string[]): ItemFicha[] {
  return ordenarPtBr([...new Set(nomes)]).map((nome) => ({
    chave: `catalogo:${nome}`,
    texto: nome,
    icone: "catalogo" as const,
  }));
}

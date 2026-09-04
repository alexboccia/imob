// Regra única que decide se um imóvel recebe a experiência de
// lançamento/em construção. Existia diluída: `isLaunch` acendia o badge
// e o filtro "Lançamentos", enquanto `constructionStage` acendia a
// timeline da obra, cada um por conta própria — dava pra ter obra em
// andamento sem o rótulo, e rótulo sem obra, com a página tratando os
// dois casos igual.
//
// IMPORTANTE: os dois campos são independentes NO BANCO e continuam
// assim. Esta função não muda o significado de nenhum deles nem
// reclassifica imóvel existente; só concentra num lugar a leitura
// "isto é um imóvel novo/em obra" que a página pública precisa fazer.
import { ESTAGIO_OBRA_LABEL, formatarMesAno } from "@/lib/format";

// Estágios em que a obra ainda não terminou. READY_TO_MOVE fica de fora
// de propósito: o imóvel pode ter sido cadastrado com esse estágio
// justamente pra dizer que está PRONTO, e aí a página é a de um imóvel
// comum.
const ESTAGIOS_EM_OBRA = ["PRE_CONSTRUCTION", "UNDER_CONSTRUCTION"];

export type ImovelLancamento = {
  isLaunch: boolean;
  constructionStage: string | null;
  deliveryForecast: Date | null;
  developer: string | null;
};

export function estaEmObra(imovel: {
  constructionStage: string | null;
}): boolean {
  return (
    imovel.constructionStage !== null &&
    ESTAGIOS_EM_OBRA.includes(imovel.constructionStage)
  );
}

// Lançamento = rótulo comercial marcado pelo corretor OU obra em
// andamento. Os dois caminhos existem porque são decisões diferentes de
// quem cadastra: "Lançamento" é posicionamento de venda; o estágio é
// fato sobre a construção. Qualquer um dos dois já justifica a página
// falar de prazo e evolução.
export function ehLancamento(imovel: {
  isLaunch: boolean;
  constructionStage: string | null;
}): boolean {
  return imovel.isLaunch || estaEmObra(imovel);
}

// Rótulo do estágio pra exibição ("Na planta", "Em construção", "Pronto
// para morar"), ou null quando o imóvel não tem estágio cadastrado
// ("Não se aplica" no formulário). Nunca inventa um estágio a partir do
// rótulo de lançamento.
export function rotuloEstagioObra(imovel: {
  constructionStage: string | null;
}): string | null {
  if (!imovel.constructionStage) return null;
  return ESTAGIO_OBRA_LABEL[imovel.constructionStage] ?? null;
}

// Previsão de entrega em formato comercial por extenso ("Dezembro de
// 2027"). O campo é preenchido por um <input type="month">, então a
// granularidade REAL do dado é mês/ano — nunca dia. formatarMesAno
// ("dez/27") continua sendo o formato compacto usado dentro da timeline;
// este é o formato de leitura, pra quando a data aparece sozinha.
const MESES_EXTENSO = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function previsaoEntregaPorExtenso(data: Date | null): string | null {
  if (!data) return null;
  const mes = MESES_EXTENSO[data.getUTCMonth()];
  if (!mes) return null;
  return `${mes} de ${data.getUTCFullYear()}`;
}

export { formatarMesAno };

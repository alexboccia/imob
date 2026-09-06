// =======================================================================
// Valor de fechamento da oportunidade (Fase 9)
// =======================================================================
// O que este número É: o valor NEGOCIADO pelo qual a oportunidade foi
// fechada, informado pelo corretor no momento de marcar como ganha.
//
// O que ele NÃO É, e por isso nunca é chamado assim em lugar nenhum:
//
//   RECEITA    A receita da imobiliária seria a comissão/fee sobre este
//              valor — conceito que o produto não registra. Chamar o
//              valor do negócio de receita inflaria o faturamento pelo
//              valor inteiro do imóvel.
//   COMISSÃO   Não existe percentual, nem fixo, nem campo. Nada é
//              calculado automaticamente.
//   PREÇO      Property.price é o preço ANUNCIADO. O fechado quase nunca
//              é igual, e usar um pelo outro apagaria justamente a
//              diferença que interessa ao corretor.
//
// `Deal.finalValue`/`Deal.commission` continuam existindo no schema e
// continuam sendo CÓDIGO MORTO (zero escritas em todo o produto — ver
// auditoria da Fase 8). Esta fase não os usa nem os remove: a remoção do
// model Deal é dívida técnica própria.
//
// MOEDA: o produto é BRL-only na prática. Todos os campos monetários
// (Property.price/rentPrice/condoFee/propertyTax, PersonPreference
// min/maxPrice) são Decimal(14,2) sem coluna de moeda, e formatarPreco
// fixa "BRL". A única coluna `currency` do schema é de Subscription
// (cobrança da plataforma), sem relação com negociação. Nenhuma
// infraestrutura multi-moeda foi criada aqui — quando existir, este
// arquivo e format.ts mudam juntos.
// =======================================================================

// Teto de sanidade, bem abaixo do limite físico da coluna
// Decimal(14,2) (~999 bilhões): um negócio imobiliário acima de 1 bilhão
// é, na prática, um erro de digitação (dígito a mais na máscara). Recusar
// aqui protege o relatório de um outlier que distorceria ticket médio e
// total muito mais do que qualquer outro dado errado.
export const VALOR_FECHAMENTO_MAXIMO = 1_000_000_000;

export type ValorFechamento =
  | { ok: true; valor: number }
  | { ok: false; erro: string };

// Converte o que chegou do formulário em valor válido. O CampoMoeda envia
// o número já normalizado ("850000.00") num input hidden, mas isso é UX:
// o FormData é editável por qualquer um, então toda a validação real
// acontece aqui, no servidor.
//
// Recusa explicitamente 0 e negativo: "ganho por R$ 0" não é um negócio
// fechado, é um campo não preenchido — e para "não sei o valor" a
// representação correta é null (ver regra de obrigatoriedade abaixo),
// nunca zero.
export function interpretarValorFechamento(bruto: unknown): ValorFechamento {
  if (typeof bruto !== "string" && typeof bruto !== "number") {
    return { ok: false, erro: "Informe o valor de fechamento." };
  }

  const texto = String(bruto).trim();
  if (!texto) return { ok: false, erro: "Informe o valor de fechamento." };

  const numero = Number(texto);
  // Number("") é 0 e Number("abc") é NaN; Infinity vem de "1e999".
  if (!Number.isFinite(numero)) {
    return { ok: false, erro: "Valor de fechamento inválido." };
  }
  if (numero <= 0) {
    return { ok: false, erro: "O valor de fechamento precisa ser maior que zero." };
  }
  if (numero > VALOR_FECHAMENTO_MAXIMO) {
    return { ok: false, erro: "Valor de fechamento acima do limite permitido." };
  }
  // Mais de 2 casas não cabe em Decimal(14,2) e seria truncado em
  // silêncio pelo banco — melhor recusar do que gravar um valor
  // diferente do que a pessoa digitou.
  const casas = texto.includes(".") ? texto.split(".")[1].length : 0;
  if (casas > 2) {
    return { ok: false, erro: "Use no máximo duas casas decimais." };
  }

  return { ok: true, valor: numero };
}

// -----------------------------------------------------------------------
// ZERO vs DESCONHECIDO — a distinção que sustenta todo o relatório
// -----------------------------------------------------------------------
// Um ganho anterior a esta fase (ou qualquer ganho cujo valor não tenha
// sido registrado) tem closedValue = null. Isso NÃO é R$ 0: é ausência de
// medição. Somar null como zero puxaria o ticket médio para baixo e
// afirmaria um total menor do que o real.
//
// Por isso o agregado devolve as duas coisas separadas: o total/ticket
// calculados SÓ sobre os ganhos com valor, e quantos ganhos ficaram sem
// valor — para a tela dizer isso em vez de esconder.
export type AgregadoValorFechado = {
  // Soma dos ganhos COM valor registrado.
  total: number;
  // Quantos ganhos entraram nessa soma.
  ganhosComValor: number;
  // Quantos ganhos existem sem valor registrado (legado ou não informado).
  ganhosSemValor: number;
  // total / ganhosComValor. null quando não há nenhum ganho com valor —
  // nunca 0, que afirmaria "os negócios valeram zero".
  ticketMedio: number | null;
};

export function agregarValorFechado(
  ganhos: readonly { closedValue: number | null }[]
): AgregadoValorFechado {
  let total = 0;
  let comValor = 0;
  let semValor = 0;

  for (const ganho of ganhos) {
    if (ganho.closedValue === null || !Number.isFinite(ganho.closedValue)) {
      semValor += 1;
      continue;
    }
    total += ganho.closedValue;
    comValor += 1;
  }

  return {
    // Arredonda a soma em centavos: somar floats de 2 casas acumula erro
    // binário (0.1 + 0.2), e o total exibido precisa bater com a soma das
    // linhas exibidas.
    total: Math.round(total * 100) / 100,
    ganhosComValor: comValor,
    ganhosSemValor: semValor,
    ticketMedio: comValor === 0 ? null : Math.round((total / comValor) * 100) / 100,
  };
}

// Decimal do Prisma chega como objeto; nunca usar Number() direto num
// valor possivelmente nulo sem tratar, senão null vira 0 — exatamente a
// confusão entre "sem valor" e "valor zero" que esta fase combate.
export function decimalParaValor(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor.toString());
  return Number.isFinite(numero) ? numero : null;
}

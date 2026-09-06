// =======================================================================
// Comissão do negócio (Fase 10)
// =======================================================================
// O que este número É: o valor, em dinheiro, da COMISSÃO daquele negócio,
// informado pela equipe. Nada é calculado automaticamente.
//
// -----------------------------------------------------------------------
// POR QUE NÃO EXISTE REGRA DE COMISSÃO NO PRODUTO
// -----------------------------------------------------------------------
// Auditoria completa do domínio (Fase 10): não existe NENHUM percentual,
// taxa, fee ou configuração de comissão em lugar nenhum —
// Organization, OrganizationSettings, Property, PropertyInterest,
// OrganizationMember: nada. `Deal.commission` existe no schema mas o
// model inteiro segue sendo CÓDIGO MORTO (zero create em todo o projeto,
// só `deleteMany` de limpeza) e não foi ressuscitado.
//
// Consequência assumida: a comissão é INFORMADA, nunca derivada. Nenhum
// "closedValue × 6%", nenhuma regra por tipo de imóvel, nenhuma regra
// diferente para SALE e RENT — o produto não sabe nada disso, e inventar
// seria fabricar dinheiro.
//
// -----------------------------------------------------------------------
// POR QUE "COMISSÃO", E NUNCA "RECEITA"
// -----------------------------------------------------------------------
// Receita exigiria saber QUANTO DISSO fica com a operação. Não existe
// split, co-broker, parceiro, percentual do corretor nem percentual da
// imobiliária no domínio — nada que permita repartir este valor. Então o
// que se registra é a comissão DO NEGÓCIO, e a interface chama exatamente
// assim. Chamar de receita afirmaria uma divisão que ninguém declarou.
//
// LIMITAÇÃO DOCUMENTADA: sem split, não dá para responder "quanto o
// corretor X ganhou" — só "quanto o negócio gerou de comissão".
// =======================================================================

// Mesmo teto de sanidade de valor-fechamento.ts, pelo mesmo motivo: um
// dígito a mais na máscara distorceria média e total mais do que
// qualquer outro dado errado.
export const COMISSAO_MAXIMA = 1_000_000_000;

export type ComissaoInterpretada =
  | { ok: true; valor: number | null }
  | { ok: false; erro: string };

// Comissão é OPCIONAL: vazio/ausente devolve `null` com ok:true, porque
// "ainda não sei a comissão" é um estado legítimo de um negócio ganho —
// diferente de closedValue, que é obrigatório no fechamento.
//
// Zero é RECUSADO de propósito: com o campo opcional, "sem comissão" já
// se expressa deixando em branco (null). Aceitar 0 criaria dois jeitos de
// dizer coisas diferentes com o mesmo símbolo e tornaria impossível
// distinguir "não registrada" de "foi zero" nos relatórios.
export function interpretarComissao(bruto: unknown): ComissaoInterpretada {
  if (bruto === null || bruto === undefined) return { ok: true, valor: null };
  if (typeof bruto !== "string" && typeof bruto !== "number") {
    return { ok: false, erro: "Valor de comissão inválido." };
  }

  const texto = String(bruto).trim();
  if (!texto) return { ok: true, valor: null };

  const numero = Number(texto);
  if (!Number.isFinite(numero)) return { ok: false, erro: "Valor de comissão inválido." };
  if (numero <= 0) {
    return {
      ok: false,
      erro: "A comissão precisa ser maior que zero. Deixe em branco se ainda não houver comissão.",
    };
  }
  if (numero > COMISSAO_MAXIMA) {
    return { ok: false, erro: "Valor de comissão acima do limite permitido." };
  }
  // Mais de 2 casas não cabe em Decimal(14,2) e seria truncado em
  // silêncio pelo banco.
  const casas = texto.includes(".") ? texto.split(".")[1].length : 0;
  if (casas > 2) return { ok: false, erro: "Use no máximo duas casas decimais na comissão." };

  return { ok: true, valor: numero };
}

// Comissão maior que o próprio valor fechado é BLOQUEADA — decisão
// tomada pela semântica do produto, não por intuição: comissão é a
// remuneração DERIVADA da transação, então não pode ser maior que a
// transação inteira. E a causa realista de um número assim é um dígito a
// mais na máscara, o mesmo erro que o teto acima já protege.
//
// Só é possível comparar quando o valor fechado é conhecido; quando não
// é (WON legado sendo corrigido só na comissão), não há o que validar e
// a comissão passa.
export function comissaoExcedeValorFechado(
  comissao: number | null,
  valorFechado: number | null
): boolean {
  if (comissao === null || valorFechado === null) return false;
  return comissao > valorFechado;
}

// -----------------------------------------------------------------------
// Agregação — ZERO vs DESCONHECIDO, de novo
// -----------------------------------------------------------------------
// Um ganho sem comissão registrada NÃO entra como zero: entraria puxando
// a média para baixo e afirmando um total menor que o real. O agregado
// devolve as duas coisas separadas, para a tela declarar quantos ficaram
// de fora.
export type AgregadoComissao = {
  total: number;
  ganhosComComissao: number;
  ganhosSemComissao: number;
  // total / ganhosComComissao. null quando nenhum ganho tem comissão —
  // nunca 0, que afirmaria "as comissões foram zero".
  comissaoMedia: number | null;
  // Comissão efetiva: soma das comissões ÷ soma dos valores fechados,
  // considerando SÓ os negócios em que os DOIS são conhecidos. Misturar
  // um negócio com comissão e sem valor fechado (ou vice-versa) produziria
  // uma proporção entre universos diferentes. null quando não há nenhum
  // negócio com os dois.
  comissaoEfetiva: number | null;
};

const centavos = (n: number) => Math.round(n * 100) / 100;

export function agregarComissao(
  ganhos: readonly { closedValue: number | null; commissionValue: number | null }[]
): AgregadoComissao {
  let total = 0;
  let comComissao = 0;
  let semComissao = 0;
  // Bases da comissão efetiva: só negócios com AMBOS conhecidos.
  let comissaoComBase = 0;
  let valorComBase = 0;

  for (const ganho of ganhos) {
    const comissao = Number.isFinite(ganho.commissionValue as number)
      ? (ganho.commissionValue as number)
      : null;
    if (comissao === null) {
      semComissao += 1;
      continue;
    }
    total += comissao;
    comComissao += 1;

    const fechado = Number.isFinite(ganho.closedValue as number)
      ? (ganho.closedValue as number)
      : null;
    if (fechado !== null && fechado > 0) {
      comissaoComBase += comissao;
      valorComBase += fechado;
    }
  }

  return {
    total: centavos(total),
    ganhosComComissao: comComissao,
    ganhosSemComissao: semComissao,
    comissaoMedia: comComissao === 0 ? null : centavos(total / comComissao),
    comissaoEfetiva: valorComBase === 0 ? null : (comissaoComBase / valorComBase) * 100,
  };
}

// Atalho de percentual usado SÓ na interface: converte "5" + valor
// fechado em reais. Nada disso é persistido — o que vai para o banco é o
// valor resultante, que a pessoa vê e confirma antes de salvar.
export function calcularComissaoPorPercentual(
  valorFechado: number | null,
  percentual: unknown
): number | null {
  if (valorFechado === null || !Number.isFinite(valorFechado) || valorFechado <= 0) return null;
  const numero = Number(String(percentual ?? "").replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0 || numero > 100) return null;
  return centavos((valorFechado * numero) / 100);
}

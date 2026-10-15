// Fase 122-B (AUD-121-006) — infraestrutura de configuração do
// percentual PADRÃO de comissão por imobiliária (OrganizationSettings.
// defaultCommissionPercent).
//
// O QUE ISTO É: um valor configurável, isolado por organização, que
// serve só de ATALHO de preenchimento em calcularComissaoPorPercentual
// (comissao.ts) — sugere um valor em reais a partir do percentual e do
// valor fechado, que a pessoa ainda vê e confirma antes de salvar.
//
// O QUE ISTO NÃO É: a auditoria da Fase 121 (AUD-121-006) e o briefing
// da Fase 122 pedem a CAPACIDADE TÉCNICA de configurar, não uma regra
// comercial completa de cálculo de comissão — o produto não sabe se o
// percentual varia por tipo de negócio, por corretor, por faixa de
// valor, nem se há split entre imobiliária e corretor (ver o
// levantamento completo em comissao.ts). Como essa regra NUNCA foi
// definida, esta infraestrutura deliberadamente:
//   - nunca aplica o percentual automaticamente a nenhum negócio;
//   - nunca reescreve PropertyInterest.commissionValue de negócios já
//     fechados (nenhuma alteração retroativa);
//   - trata ausência (null) como "sem padrão configurado", o estado de
//     toda organização hoje — sem backfill.

export const PERCENTUAL_COMISSAO_MAXIMO = 100;

export type PercentualComissaoInterpretado =
  | { ok: true; valor: number | null }
  | { ok: false; erro: string };

// Mesma filosofia de interpretarComissao (comissao.ts): ausente/vazio é
// um estado legítimo ("esta organização não configurou um padrão"), não
// um erro. Zero é recusado pelo mesmo motivo que lá — um padrão de 0%
// não tem uso real e distorceria qualquer leitura futura do valor.
export function interpretarPercentualComissaoPadrao(bruto: unknown): PercentualComissaoInterpretado {
  if (bruto === null || bruto === undefined) return { ok: true, valor: null };
  if (typeof bruto !== "string" && typeof bruto !== "number") {
    return { ok: false, erro: "Percentual de comissão inválido." };
  }

  const texto = String(bruto).trim();
  if (!texto) return { ok: true, valor: null };

  const numero = Number(texto.replace(",", "."));
  if (!Number.isFinite(numero)) return { ok: false, erro: "Percentual de comissão inválido." };
  if (numero <= 0) {
    return {
      ok: false,
      erro: "O percentual precisa ser maior que zero. Deixe em branco para não configurar um padrão.",
    };
  }
  if (numero > PERCENTUAL_COMISSAO_MAXIMO) {
    return { ok: false, erro: "O percentual não pode passar de 100." };
  }
  // Decimal(5,2) no banco — mais de 2 casas seria truncado em silêncio.
  const normalizado = texto.replace(",", ".");
  const casas = normalizado.includes(".") ? normalizado.split(".")[1].length : 0;
  if (casas > 2) return { ok: false, erro: "Use no máximo duas casas decimais no percentual." };

  return { ok: true, valor: numero };
}

// =======================================================================
// Pagamento e liquidação de comissão (Fase 13)
// =======================================================================
// Fecha a última inferência da cadeia financeira. Quatro conceitos, nunca
// misturados:
//
//   1. COMISSÃO DO NEGÓCIO   PropertyInterest.commissionValue   (Fase 10)
//   2. COMISSÃO ATRIBUÍDA    Participant.allocationValue        (Fase 12)
//   3. COMISSÃO PAGA         Σ pagamentos VÁLIDOS               (Fase 13)
//   4. SALDO PENDENTE        atribuído − pago                   (derivado)
//
// ATRIBUÍDO NÃO É PAGO. Pagamento só existe quando alguém registra o
// fato: nada é inferido de WON, de commissionValue, de allocationValue,
// do responsável nem da data de fechamento.
//
// -----------------------------------------------------------------------
// PAGAMENTO VÁLIDO
// -----------------------------------------------------------------------
// É o pagamento não cancelado. Cancelar não apaga a linha (registro
// financeiro apagado não deixa rastro de que existiu): ela sai da soma e
// continua no histórico. Esse é também o mecanismo de CORREÇÃO — erro de
// digitação se conserta cancelando e registrando o valor certo, em vez de
// reescrever um fato consumado. Por isso não existe valor negativo no
// ledger: a soma nunca depende de interpretar sinal.
// =======================================================================

// Mesmo teto de sanidade das fases 9/10/12, pelo mesmo motivo: um dígito
// a mais na máscara distorce mais que qualquer outro erro.
export const PAGAMENTO_MAXIMO = 1_000_000_000;

export type PagamentoInterpretado =
  | { ok: true; valor: number }
  | { ok: false; erro: string };

// Diferente de allocationValue, o valor do pagamento é OBRIGATÓRIO: um
// pagamento sem valor não é um pagamento. Vazio é erro, não "null".
export function interpretarPagamento(bruto: unknown): PagamentoInterpretado {
  if (bruto === null || bruto === undefined) {
    return { ok: false, erro: "Informe o valor pago." };
  }
  if (typeof bruto !== "string" && typeof bruto !== "number") {
    return { ok: false, erro: "Valor de pagamento inválido." };
  }
  const texto = String(bruto).trim();
  if (!texto) return { ok: false, erro: "Informe o valor pago." };

  const numero = Number(texto);
  if (!Number.isFinite(numero)) return { ok: false, erro: "Valor de pagamento inválido." };
  if (numero <= 0) return { ok: false, erro: "O valor pago precisa ser maior que zero." };
  if (numero > PAGAMENTO_MAXIMO) {
    return { ok: false, erro: "Valor de pagamento acima do limite permitido." };
  }
  const casas = texto.includes(".") ? texto.split(".")[1].length : 0;
  if (casas > 2) return { ok: false, erro: "Use no máximo duas casas decimais no valor pago." };

  return { ok: true, valor: numero };
}

export type DataPagamentoInterpretada =
  | { ok: true; data: Date }
  | { ok: false; erro: string };

// paidAt é o instante em que o pagamento OCORREU — nunca createdAt, que é
// quando alguém digitou. Um pagamento de ontem pode ser registrado hoje,
// e é paidAt que manda em todo recorte temporal de liquidação.
//
// DATA FUTURA É RECUSADA: esta linha é fato consumado. "Vai pagar dia 10"
// é previsão, um domínio diferente (conta a pagar), que esta fase não
// modela — e misturar os dois tornaria "pago no período" uma mistura de
// realizado com promessa.
export function interpretarDataPagamento(
  bruto: unknown,
  agora: Date = new Date()
): DataPagamentoInterpretada {
  const texto = String(bruto ?? "").trim();
  if (!texto) return { ok: false, erro: "Informe a data do pagamento." };

  // <input type="date"> entrega YYYY-MM-DD. Interpretado como meio-dia
  // UTC para que o dia escolhido não escorregue para o anterior em
  // fusos negativos (mesma técnica de scheduled-activity-schema).
  const casamento = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!casamento) return { ok: false, erro: "Data de pagamento inválida." };
  const [, ano, mes, dia] = casamento;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia), 12, 0, 0));
  if (Number.isNaN(data.getTime())) return { ok: false, erro: "Data de pagamento inválida." };

  // Comparação no fim do dia de hoje: registrar um pagamento feito hoje
  // de manhã não pode ser recusado por causa do meio-dia acima.
  const fimDeHoje = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 23, 59, 59, 999)
  );
  if (data.getTime() > fimDeHoje.getTime()) {
    return {
      ok: false,
      erro: "A data do pagamento não pode ser no futuro — registre apenas pagamentos já realizados.",
    };
  }
  return { ok: true, data };
}

const centavos = (n: number) => Math.round(n * 100) / 100;

// -----------------------------------------------------------------------
// Estado derivado, nunca persistido
// -----------------------------------------------------------------------
// Uma coluna `status` divergiria do ledger no primeiro cancelamento. O
// estado é sempre recalculado a partir dos fatos.
export type StatusLiquidacao = "SEM_VALOR" | "PENDENTE" | "PARCIAL" | "LIQUIDADO";

export const STATUS_LIQUIDACAO_LABEL: Record<StatusLiquidacao, string> = {
  // allocationValue null: não há obrigação conhecida. NUNCA
  // "Pendente R$ 0", que afirmaria uma dívida de zero.
  SEM_VALOR: "Participação sem valor definido",
  PENDENTE: "Pendente",
  PARCIAL: "Parcial",
  LIQUIDADO: "Liquidado",
};

export type LiquidacaoParticipante = {
  atribuido: number | null;
  pago: number;
  // atribuido − pago. null quando não há atribuição: sem obrigação não
  // existe saldo, e "R$ 0 pendente" seria falso.
  pendente: number | null;
  status: StatusLiquidacao;
};

// `pagamentos` deve conter APENAS os válidos (não cancelados) — quem
// chama filtra, e é isso que faz o cancelamento devolver o valor ao saldo
// sem apagar a linha.
export function resumirLiquidacao(
  atribuido: number | null,
  pagamentosValidos: readonly number[]
): LiquidacaoParticipante {
  const pago = centavos(pagamentosValidos.reduce((soma, v) => soma + v, 0));
  const temAtribuicao = atribuido !== null && Number.isFinite(atribuido);
  if (!temAtribuicao) {
    return { atribuido: null, pago, pendente: null, status: "SEM_VALOR" };
  }
  const pendente = centavos(atribuido! - pago);
  return {
    atribuido: atribuido!,
    pago,
    pendente,
    status: pago === 0 ? "PENDENTE" : pendente === 0 ? "LIQUIDADO" : "PARCIAL",
  };
}

export type ValidacaoPagamento = { ok: true } | { ok: false; erro: string };

// REGRA MATEMÁTICA: Σ pagamentos válidos <= allocationValue.
//
// Sem atribuição não existe teto contra o qual validar, e registrar
// pagamento seria afirmar uma obrigação que ninguém declarou — por isso
// é bloqueado em vez de aceito sem limite. (Como a Fase 12 já bloqueia
// atribuir valor quando commissionValue é null, isso também fecha o
// caminho de pagar num negócio sem comissão registrada, sem precisar de
// uma regra separada.)
export function validarPagamentoContraAtribuicao(
  novoValor: number,
  atribuido: number | null,
  pagamentosValidosExistentes: readonly number[]
): ValidacaoPagamento {
  if (atribuido === null || !Number.isFinite(atribuido)) {
    return {
      ok: false,
      erro: "Defina o valor da participação antes de registrar pagamento.",
    };
  }
  const jaPago = pagamentosValidosExistentes.reduce((soma, v) => soma + v, 0);
  if (centavos(jaPago + novoValor) > atribuido) {
    return {
      ok: false,
      erro: "A soma dos pagamentos não pode ultrapassar o valor da participação.",
    };
  }
  return { ok: true };
}

// INVARIANTE NOVA DESTA FASE, cobrando as fases anteriores: a parcela
// atribuída não pode cair abaixo do que já foi pago, nem virar "sem
// valor" quando há pagamento. Usada por atualizarParticipante.
export function validarAtribuicaoContraPagamentos(
  novaAtribuicao: number | null,
  pagamentosValidos: readonly number[]
): ValidacaoPagamento {
  const pago = centavos(pagamentosValidos.reduce((soma, v) => soma + v, 0));
  if (pago === 0) return { ok: true };
  if (novaAtribuicao === null) {
    return {
      ok: false,
      erro: "Esta participação já tem pagamentos registrados e não pode ficar sem valor. Cancele os pagamentos primeiro.",
    };
  }
  if (novaAtribuicao < pago) {
    return {
      ok: false,
      erro: "O valor da participação não pode ficar abaixo do que já foi pago. Cancele os pagamentos primeiro.",
    };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------
// Exibição do ledger
// -----------------------------------------------------------------------
export type PagamentoExibicao = {
  id: string;
  valor: number;
  paidAtISO: string;
  cancelado: boolean;
  // Nome de quem REGISTROU (ator administrativo), não de quem recebeu —
  // quem recebe é o participante. null quando o vínculo se perdeu.
  registradoPor: string | null;
};

type PagamentoBruto = {
  id: string;
  organizationId: string;
  amount: number;
  paidAt: Date;
  cancelledAt: Date | null;
  createdByMember: { organizationId: string; user: { name: string | null } } | null;
};

// `organizationIdEsperado` fecha o mesmo canal de vazamento indireto já
// tratado no resto do projeto: as FKs são simples, então a leitura nunca
// confia — linha de outro tenant é descartada, e o nome do ator de outro
// tenant nunca chega à tela.
export function paraPagamentos(
  brutos: readonly PagamentoBruto[],
  organizationIdEsperado: string
): PagamentoExibicao[] {
  return brutos
    .filter((p) => p.organizationId === organizationIdEsperado)
    .map((p) => ({
      id: p.id,
      valor: p.amount,
      paidAtISO: p.paidAt.toISOString(),
      cancelado: p.cancelledAt !== null,
      registradoPor:
        p.createdByMember && p.createdByMember.organizationId === organizationIdEsperado
          ? p.createdByMember.user.name?.trim() || "Membro sem nome"
          : null,
    }))
    // Mais recente primeiro, pela data do FATO (paidAt), não do registro.
    .sort((a, b) => b.paidAtISO.localeCompare(a.paidAtISO));
}

export function somarPagamentosValidos(pagamentos: readonly PagamentoExibicao[]): number {
  return centavos(
    pagamentos.filter((p) => !p.cancelado).reduce((soma, p) => soma + p.valor, 0)
  );
}

// -----------------------------------------------------------------------
// Agregação do Analytics — FLUXO, não estoque
// -----------------------------------------------------------------------
// "Pago no período" é uma coorte por paidAt, e NÃO por closedAt: um
// negócio fechado em janeiro pode ser pago em março, e o pagamento
// pertence a março. Por isso esta agregação não reaproveita a coorte de
// fechamentos usada pelos outros blocos.
//
// Saldo pendente NÃO entra aqui de propósito: saldo é ESTOQUE atual, e
// um bloco filtrado por 30 dias que mostrasse estoque misturaria as duas
// naturezas. O saldo vive no contexto da negociação, onde a pergunta é
// sobre aquele negócio e não sobre um período.
export type LinhaPagamentoParticipante = {
  memberId: string;
  nome: string;
  inativo: boolean;
  pagamentos: number;
  pago: number;
};

export function agruparPagamentosPorParticipante(
  pagamentos: readonly {
    memberId: string;
    nome: string;
    inativo: boolean;
    valor: number;
  }[]
): LinhaPagamentoParticipante[] {
  const linhas = new Map<string, LinhaPagamentoParticipante>();
  for (const pagamento of pagamentos) {
    const atual = linhas.get(pagamento.memberId) ?? {
      memberId: pagamento.memberId,
      nome: pagamento.nome,
      inativo: pagamento.inativo,
      pagamentos: 0,
      pago: 0,
    };
    atual.pagamentos += 1;
    atual.pago += pagamento.valor;
    linhas.set(pagamento.memberId, atual);
  }
  return [...linhas.values()]
    .map((l) => ({ ...l, pago: centavos(l.pago) }))
    .sort((a, b) => b.pago - a.pago || a.nome.localeCompare(b.nome, "pt-BR"));
}

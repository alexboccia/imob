import type { VisitOutcome, ScheduledActivityStatus } from "@/generated/prisma/client";

// =======================================================================
// Resultado da visita (Fase 37)
// =======================================================================
// Uma visita deixou de ser "um compromisso que sumiu da agenda".
//
// O produto já SINALIZAVA a pendência: acaoOperacionalDaVisita devolve
// "REGISTRAR_RESULTADO" assim que o horário passa, e a Agenda mostra isso
// em texto desde a Fase H.7. O que não existia era onde registrar — o
// único caminho era "Marcar como realizada", que dizia apenas que algo
// aconteceu, sem dizer o quê.
//
// -----------------------------------------------------------------------
// TRÊS FATOS, TRÊS LUGARES — nenhum deles derivado do outro
// -----------------------------------------------------------------------
//   ScheduledActivity.status        o que foi feito do COMPROMISSO
//                                   (SCHEDULED/COMPLETED/CANCELLED/NO_SHOW)
//   ScheduledActivity.visitOutcome  o que a VISITA produziu comercialmente
//   PropertyInterest.stage          o estado da NEGOCIAÇÃO
//
// RESULTADO NÃO É STAGE. Uma visita positiva não vira PROPOSAL e uma
// negativa não vira REJECTED: o corretor decide isso, o sistema não
// adivinha. A única consequência automática é a que JÁ EXISTIA desde a
// Fase H.2 — VISIT_SCHEDULED avança para VISITED quando a visita
// realmente acontece — e ela foi preservada, com um refinamento correto:
// num NO_SHOW ela não acontece, porque não houve visita.
//
// RESULTADO NEGATIVO NÃO É LOST. lostReason pertence ao fechamento
// (Fase 34) e nada aqui o preenche.
// =======================================================================

/**
 * O que o corretor escolhe ao encerrar uma visita. Quatro opções numa
 * lista só — é UMA pergunta ("o que aconteceu?"), e quebrá-la em duas
 * (aconteceu? sim/não · gostou? sim/não) faria o corretor responder duas
 * vezes o que ele sabe de uma vez.
 *
 * NAO_COMPARECEU não é um VisitOutcome no banco: ele vira STATUS
 * (NO_SHOW), porque o fato é sobre o compromisso e não sobre o imóvel.
 * A tradução acontece em `desfechoDaVisita`, abaixo.
 */
export const RESULTADOS_VISITA = [
  "INTERESTED",
  "UNDECIDED",
  "NOT_INTERESTED",
  "NAO_COMPARECEU",
] as const;

export type ResultadoVisita = (typeof RESULTADOS_VISITA)[number];

// Rótulos que descrevem o FATO, nunca o julgamento do cliente. "Não
// compareceu" e não "furou"; "sem interesse neste imóvel" e não "cliente
// ruim" — o histórico é lido depois por outra pessoa.
export const RESULTADO_VISITA_LABEL: Record<ResultadoVisita, string> = {
  INTERESTED: "Gostou e quer avançar",
  UNDECIDED: "Visitou, ainda sem definição",
  NOT_INTERESTED: "Sem interesse neste imóvel",
  NAO_COMPARECEU: "Não compareceu",
};

// Texto curto abaixo de cada opção. Existe porque a diferença entre
// "sem definição" e "sem interesse" é a que mais erra no preenchimento, e
// errar aqui contamina o histórico inteiro.
export const RESULTADO_VISITA_AJUDA: Record<ResultadoVisita, string> = {
  INTERESTED: "A visita aconteceu e há interesse real neste imóvel.",
  UNDECIDED: "A visita aconteceu, mas o cliente ainda não decidiu.",
  NOT_INTERESTED: "A visita aconteceu e o cliente descartou este imóvel.",
  NAO_COMPARECEU: "A visita estava marcada e o cliente não apareceu.",
};

export function ehResultadoVisita(valor: unknown): valor is ResultadoVisita {
  return typeof valor === "string" && (RESULTADOS_VISITA as readonly string[]).includes(valor);
}

/**
 * Traduz a escolha do corretor nos dois fatos que o banco guarda.
 *
 * É a ÚNICA tradução no produto, e é pura: a action apenas aplica o que
 * esta função devolve, o que torna a regra testável sem banco e impossível
 * de divergir entre superfícies.
 *
 * `houveVisita` é o que decide se uma Interaction VISIT é criada e se o
 * stage pode avançar — nunca criar fato falso de visita realizada é a
 * invariante mais importante desta fase.
 */
export type DesfechoDaVisita = {
  status: Extract<ScheduledActivityStatus, "COMPLETED" | "NO_SHOW">;
  visitOutcome: VisitOutcome | null;
  houveVisita: boolean;
};

export function desfechoDaVisita(resultado: ResultadoVisita): DesfechoDaVisita {
  if (resultado === "NAO_COMPARECEU") {
    return { status: "NO_SHOW", visitOutcome: null, houveVisita: false };
  }
  return { status: "COMPLETED", visitOutcome: resultado, houveVisita: true };
}

// -----------------------------------------------------------------------
// Exibição
// -----------------------------------------------------------------------
// O que mostrar para uma visita já encerrada. Cobre o histórico anterior
// a esta fase, que é COMPLETED sem resultado nenhum — e que NÃO recebeu
// backfill: dizer "gostou" porque virou proposta seria inventar um fato.
export function rotuloResultadoRegistrado(
  status: ScheduledActivityStatus,
  visitOutcome: VisitOutcome | null
): string | null {
  if (status === "NO_SHOW") return RESULTADO_VISITA_LABEL.NAO_COMPARECEU;
  if (status !== "COMPLETED") return null;
  if (!visitOutcome) return "Resultado não registrado";
  return RESULTADO_VISITA_LABEL[visitOutcome];
}

/** Teto da observação do resultado — mesmo de ScheduledActivity.notes. */
export const LIMITE_OBSERVACAO_RESULTADO = 2000;

export type ObservacaoInterpretada =
  | { ok: true; texto: string | null }
  | { ok: false; erro: string };

// Observação é OPCIONAL: vazio devolve null, nunca string vazia — os dois
// significariam "sem observação" e guardar as duas formas tornaria
// impossível consultar o histórico de forma consistente.
export function interpretarObservacaoResultado(bruto: unknown): ObservacaoInterpretada {
  if (bruto === null || bruto === undefined) return { ok: true, texto: null };
  if (typeof bruto !== "string") return { ok: false, erro: "Observação inválida." };
  const texto = bruto.trim();
  if (!texto) return { ok: true, texto: null };
  if (texto.length > LIMITE_OBSERVACAO_RESULTADO) {
    return {
      ok: false,
      erro: `A observação deve ter no máximo ${LIMITE_OBSERVACAO_RESULTADO} caracteres.`,
    };
  }
  return { ok: true, texto };
}

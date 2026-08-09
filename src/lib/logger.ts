import * as Sentry from "@sentry/nextjs";

// Logger estruturado central — substitui console.log/warn/error espalhado
// pelo projeto. Duas responsabilidades separadas de propósito:
//
// 1. Sempre escreve uma linha JSON no console (capturada pelos logs da
//    plataforma — mesmo padrão que já existia em abuse-log.ts).
// 2. SÓ o nível "error" também reporta pra Sentry, e só com um conjunto
//    fixo de campos de contexto (allowlist) — nunca o objeto de contexto
//    inteiro que o chamador passar. Isso existe pra que "não anexar
//    e-mail/mensagem/etc. como contexto da Sentry" não dependa de cada
//    call site lembrar disso: mesmo que um `logger.error(..., {mensagem:
//    pessoa.mensagem})` aconteça em algum lugar, só os campos abaixo saem
//    daqui pra Sentry.

export type NivelLog = "debug" | "info" | "warn" | "error";

// Contexto que É permitido anexar a um evento da Sentry (organizationId e
// userId como IDs técnicos — nunca e-mail/nome; route/action/modulo pra
// filtrar por área do sistema). Qualquer outra chave passada em
// `contexto` aparece na linha de console (auditável, sob controle da
// plataforma) mas nunca é encaminhada pra Sentry.
export interface ContextoLog {
  organizationId?: string;
  userId?: string;
  platformOperatorId?: string;
  route?: string;
  action?: string;
  modulo?: string;
  requestId?: string;
  [chaveExtra: string]: unknown;
}

const PESO_NIVEL: Record<NivelLog, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const NIVEL_MINIMO: NivelLog = (() => {
  const doEnv = process.env.LOG_LEVEL;
  if (doEnv === "debug" || doEnv === "info" || doEnv === "warn" || doEnv === "error") return doEnv;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
})();

function traceIdAtual(): string | undefined {
  try {
    return Sentry.getActiveSpan()?.spanContext().traceId;
  } catch {
    return undefined;
  }
}

function escreverLinha(nivel: NivelLog, mensagem: string, contexto?: ContextoLog) {
  if (PESO_NIVEL[nivel] < PESO_NIVEL[NIVEL_MINIMO]) return;
  const linha = JSON.stringify({
    nivel,
    mensagem,
    timestamp: new Date().toISOString(),
    requestId: contexto?.requestId ?? traceIdAtual(),
    ...contexto,
  });
  if (nivel === "error") console.error(linha);
  else if (nivel === "warn") console.warn(linha);
  else console.log(linha);
}

// Só os campos da allowlist — nunca o `contexto` inteiro. Tags (não
// `extra`) porque são os campos de baixa cardinalidade explicitamente
// permitidos (organizationId/userId/route/action/modulo), o tipo de dado
// que a Sentry recomenda pra filtro/busca, não pra payload livre.
function tagsPermitidas(contexto?: ContextoLog): Record<string, string> {
  if (!contexto) return {};
  const permitidas: (keyof ContextoLog)[] = [
    "organizationId",
    "userId",
    "platformOperatorId",
    "route",
    "action",
    "modulo",
    "requestId",
  ];
  const saida: Record<string, string> = {};
  for (const chave of permitidas) {
    const valor = contexto[chave];
    if (typeof valor === "string" && valor) saida[chave] = valor;
  }
  return saida;
}

export const logger = {
  debug(mensagem: string, contexto?: ContextoLog) {
    escreverLinha("debug", mensagem, contexto);
  },
  info(mensagem: string, contexto?: ContextoLog) {
    escreverLinha("info", mensagem, contexto);
  },
  warn(mensagem: string, contexto?: ContextoLog) {
    escreverLinha("warn", mensagem, contexto);
  },
  // `erro` é opcional: às vezes o nível error é sobre uma condição (ex:
  // "R2_BUCKET_NAME não configurado"), não uma exceção capturada.
  error(mensagem: string, erro?: unknown, contexto?: ContextoLog) {
    escreverLinha("error", mensagem, contexto);
    const tags = tagsPermitidas(contexto);
    if (erro instanceof Error) {
      Sentry.captureException(erro, { tags });
    } else if (erro !== undefined) {
      Sentry.captureMessage(`${mensagem}: ${String(erro)}`, { level: "error", tags });
    } else {
      Sentry.captureMessage(mensagem, { level: "error", tags });
    }
  },
};

// Uso restrito: só pra quando o chamador JÁ reportou o erro pra Sentry por
// outro caminho mais específico (ex: src/instrumentation.ts usa
// Sentry.captureRequestError, que já enriquece o evento com contexto de
// rota do Next) e só quer a linha estruturada no console, sem mandar o
// mesmo erro pra Sentry uma segunda vez.
export function registrarErroJaReportado(mensagem: string, contexto?: ContextoLog) {
  escreverLinha("error", mensagem, contexto);
}

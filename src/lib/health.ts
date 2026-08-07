import { prisma } from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";
import { HeadBucketCommand } from "@aws-sdk/client-s3";

// Timeout curto de propósito: um health check preso esperando uma
// dependência lenta é pior que um health check que falha rápido — quem
// está de olho (load balancer, uptime monitor) precisa de uma resposta
// em segundos, não em minutos.
const TIMEOUT_PADRAO_MS = 3000;

async function comTimeout<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([promessa, timeout]);
  } finally {
    clearTimeout(temporizador!);
  }
}

export type ResultadoChecagem = {
  ok: boolean;
  latenciaMs?: number;
  // Só usado no diagnóstico protegido (nunca no /api/health público) —
  // texto curto e genérico, nunca a mensagem de erro/stack trace crua.
  motivo?: string;
};

// Única dependência crítica do /api/health público — é o que justifica
// 503 (aplicação de pé mas incapaz de servir dado nenhum sem banco).
export async function checarBancoDeDados(timeoutMs = TIMEOUT_PADRAO_MS): Promise<ResultadoChecagem> {
  const inicio = Date.now();
  try {
    await comTimeout(prisma.$queryRaw`SELECT 1`, timeoutMs);
    return { ok: true, latenciaMs: Date.now() - inicio };
  } catch (erro) {
    return { ok: false, motivo: erro instanceof Error && erro.message === "timeout" ? "timeout" : "falha de conexão" };
  }
}

// Chamada de verdade no bucket (HeadBucket — barata, não lista nem lê
// conteúdo) — só usada no diagnóstico protegido, nunca no health check
// público (ver README/docs/operations: não fazer chamada cara em toda
// requisição pública).
export async function checarR2(timeoutMs = TIMEOUT_PADRAO_MS): Promise<ResultadoChecagem> {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket || !process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return { ok: false, motivo: "não configurado" };
  }
  const inicio = Date.now();
  try {
    const client = getR2Client();
    await comTimeout(client.send(new HeadBucketCommand({ Bucket: bucket })), timeoutMs);
    return { ok: true, latenciaMs: Date.now() - inicio };
  } catch (erro) {
    return { ok: false, motivo: erro instanceof Error && erro.message === "timeout" ? "timeout" : "falha de conexão" };
  }
}

// Só checa presença de configuração — nenhuma chamada de rede.
// A RESEND_API_KEY configurada neste projeto é escopada como "somente
// envio" (testado: resend.domains.list() retorna 401 "restricted_api_key"
// — ver docs/operations/production-checklist.md), então não existe
// operação de leitura barata pra verificar conectividade de verdade sem
// mandar e-mail real. Testar entrega de fato é manual (formulário de
// contato), não automatizado aqui.
export function checarResendConfigurado(): ResultadoChecagem {
  const ok = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  return ok ? { ok: true } : { ok: false, motivo: "não configurado" };
}

// GET /api/health — público, mínimo, rápido. Só a dependência crítica
// (banco) decide o status geral.
export async function verificarSaudeBasica(): Promise<{ saudavel: boolean }> {
  const banco = await checarBancoDeDados();
  return { saudavel: banco.ok };
}

// GET /api/admin/diagnostics — protegido, mais lento, mais detalhado.
// "saudavel" geral continua só refletindo o banco (mesma dependência
// crítica); R2/Resend aparecem como informação à parte pro admin decidir
// o que fazer, sem influenciar um alarme automático.
export async function verificarSaudeCompleta(): Promise<{
  saudavel: boolean;
  dependencias: {
    postgresql: ResultadoChecagem;
    r2: ResultadoChecagem;
    resend: ResultadoChecagem;
  };
}> {
  const [postgresql, r2] = await Promise.all([checarBancoDeDados(), checarR2()]);
  const resend = checarResendConfigurado();
  return { saudavel: postgresql.ok, dependencias: { postgresql, r2, resend } };
}

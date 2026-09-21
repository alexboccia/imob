import { prisma } from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { obterKvStore } from "@/lib/kv-store";

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

// Fase 57 — PROVIDER DE RATE LIMITING (Upstash Redis).
//
// POR QUE ESTE CHECK EXISTE: praticamente toda proteção de volume do
// produto (login com bloqueio progressivo, formulários públicos,
// cadastro de imobiliária, recuperação de senha, upload, analytics e os
// baldes de solicitação de visita da Fase 56) passa por `obterKvStore()`
// e é FAIL-OPEN: sem as variáveis, `obterKvStore()` devolve null e cada
// chamador simplesmente libera a requisição. O sistema continua de pé e
// nada na tela muda — o que torna a ausência de configuração
// silenciosa. Até esta fase não havia como um administrador descobrir
// isso sem ler o log de runtime do provedor de hospedagem.
//
// CONFIGURADO NÃO É O MESMO QUE OPERACIONAL, e esta é a razão de o
// check não parar em "as duas variáveis existem": um token revogado, um
// banco Upstash apagado ou uma URL de outro ambiente produzem
// exatamente as mesmas duas strings presentes no environment e nenhuma
// proteção de fato. Por isso aqui se faz uma ida e volta real ao Redis.
//
// A OPERAÇÃO É DE LEITURA PURA: um GET numa chave de diagnóstico que o
// produto NUNCA escreve. Ela não existe, e a resposta esperada é
// "não existe" — o que já prova o que interessa (credencial aceita e
// serviço respondendo), sem tocar em NENHUM balde real. Deliberadamente
// não se usa `incrementarComJanela`, `definir` nem `remover`: contador
// de rate limit não pode ser mexido por diagnóstico, e uma chave criada
// só para medir saúde é lixo que ninguém limpa.
//
// A chave vive num espaço próprio (`diag:`), fora do prefixo `rl:` que
// todos os baldes reais usam, então não há como colidir com chave de
// login, formulário, organização, contato ou imóvel.
const CHAVE_DIAGNOSTICO = "diag:upstash:ping";

export async function checarUpstash(timeoutMs = TIMEOUT_PADRAO_MS): Promise<ResultadoChecagem> {
  // null = UPSTASH_REDIS_REST_URL e/ou UPSTASH_REDIS_REST_TOKEN
  // ausentes. Mesma frase de R2/Resend, porque é o mesmo fato: a
  // dependência não foi configurada neste ambiente. Em dev/teste isso é
  // esperado e intencional, e continua não sendo erro — só informação.
  const store = obterKvStore();
  if (!store) return { ok: false, motivo: "não configurado" };

  const inicio = Date.now();
  try {
    await comTimeout(store.obter(CHAVE_DIAGNOSTICO), timeoutMs);
    return { ok: true, latenciaMs: Date.now() - inicio };
  } catch (erro) {
    // SANITIZAÇÃO OBRIGATÓRIA: o erro cru do cliente Upstash pode
    // carregar a URL REST (que contém o identificador do banco) e, em
    // algumas falhas de transporte, o cabeçalho de autorização. Nada
    // dele atravessa — só uma destas duas strings fixas, escolhidas
    // aqui, nunca derivadas do conteúdo da exceção. É o mesmo contrato
    // que checarBancoDeDados e checarR2 já cumprem.
    return {
      ok: false,
      motivo: erro instanceof Error && erro.message === "timeout" ? "timeout" : "falha de conexão",
    };
  }
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
    upstash: ResultadoChecagem;
  };
}> {
  // Em paralelo, como já era: o diagnóstico inteiro custa o tempo da
  // dependência mais lenta, não a soma delas. Cada check tem o seu
  // próprio timeout, então um Upstash pendurado não segura os outros.
  const [postgresql, r2, upstash] = await Promise.all([
    checarBancoDeDados(),
    checarR2(),
    checarUpstash(),
  ]);
  const resend = checarResendConfigurado();
  // `saudavel` continua refletindo SÓ o banco (Fase 57 não muda isso):
  // rate limiting desligado é um problema sério de segurança, mas não
  // impede a aplicação de servir — e transformar isso em alarme
  // automático mudaria a política de disponibilidade, que não é o
  // escopo desta fase.
  return { saudavel: postgresql.ok, dependencias: { postgresql, r2, resend, upstash } };
}

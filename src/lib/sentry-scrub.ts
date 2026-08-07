import type * as Sentry from "@sentry/nextjs";

// Camada de defesa em profundidade sobre o que já é restringido na origem
// (dataCollection em instrumentation-client.ts/sentry.server.config.ts/
// sentry.edge.config.ts, que desliga corpo de request/response, cookies e
// headers). Esta função roda em beforeSend/beforeSendTransaction — a
// última parada antes do evento sair do processo — e assume que qualquer
// campo pode conter dado sensível, mesmo que a coleta na origem já devesse
// ter impedido isso (defesa em profundidade: se um integration futuro da
// Sentry passar a anexar algo nesses campos, ainda barra aqui).
//
// Regra geral: CPF é removido por completo (não existe "meio-CPF" seguro
// de mandar); telefone e e-mail são mascarados parcialmente (mantém valor
// de correlação/triagem sem expor o dado completo); senha, token, cookie e
// Authorization são sempre removidos por inteiro, nunca mascarados.

const CHAVE_SENSIVEL =
  /senha|password|passwordhash|token|secret|authsecret|authorization|cookie|cpf|tax[_-]?id|cart[aã]o|card[_-]?number|mensagem|message|notes?|descricao|description/i;

const REGEX_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const REGEX_EMAIL = /\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b/g;
// Telefone BR: DDD opcional entre parênteses + 8 ou 9 dígitos, com
// separadores opcionais — cobre "(11) 91234-5678", "11912345678",
// "11 3123-4567" etc. Propositalmente conservador (assume que dígito
// demais é melhor mascarado à toa do que dado de menos vazado).
const REGEX_TELEFONE = /\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;

function mascararEmailEncontrado(email: string): string {
  const arroba = email.indexOf("@");
  if (arroba <= 0) return "[email-filtrado]";
  const dominio = email.slice(arroba + 1);
  return `${email[0]}***@${dominio}`;
}

function mascararTelefoneEncontrado(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length < 8) return valor; // dígito demais curto pra ser telefone de verdade
  return `***${digitos.slice(-4)}`;
}

function mascararTextoLivre(texto: string): string {
  return texto
    .replace(REGEX_CPF, "[cpf-filtrado]")
    .replace(REGEX_EMAIL, mascararEmailEncontrado)
    .replace(REGEX_TELEFONE, mascararTelefoneEncontrado);
}

// Percorre um objeto arbitrário (extra, contexts custom, data de
// breadcrumb, vars de stack frame): chave sensível vira "[filtrado]"
// inteiro (nunca mascarado parcial — não são candidatos a mascaramento
// parcial como telefone/e-mail), o resto passa pelo mascaramento de texto
// livre caso seja string.
function limparObjeto(valor: unknown, profundidade = 0): unknown {
  if (valor == null || profundidade > 6) return valor;
  if (typeof valor === "string") return mascararTextoLivre(valor);
  if (Array.isArray(valor)) return valor.map((item) => limparObjeto(item, profundidade + 1));
  if (typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      saida[chave] = CHAVE_SENSIVEL.test(chave) ? "[filtrado]" : limparObjeto(item, profundidade + 1);
    }
    return saida;
  }
  return valor;
}

function mascararValorDeParametro(chave: string, valor: string): string {
  return CHAVE_SENSIVEL.test(chave) ? "[filtrado]" : mascararTextoLivre(valor);
}

function mascararQueryString(query: string): string {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  for (const chave of [...params.keys()]) {
    params.set(chave, mascararValorDeParametro(chave, params.get(chave) ?? ""));
  }
  return params.toString();
}

// event.request.query_string pode chegar como string, como objeto
// chave→valor, ou como array de pares [chave, valor] (Sentry.QueryParams) —
// cobre as três formas em vez de só a string, que era o único caso
// tratado antes.
function mascararQueryParams<T extends string | Record<string, string> | Array<[string, string]>>(
  query: T
): T {
  if (typeof query === "string") return mascararQueryString(query) as T;
  if (Array.isArray(query)) {
    return query.map(([chave, valor]) => [chave, mascararValorDeParametro(chave, valor)]) as T;
  }
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(query)) {
    saida[chave] = mascararValorDeParametro(chave, valor);
  }
  return saida as T;
}

function mascararUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.search) parsed.search = mascararQueryString(parsed.search);
    return parsed.toString();
  } catch {
    // URL relativa ou inválida — tenta só na parte depois do "?".
    const [caminho, query] = url.split("?");
    return query ? `${caminho}?${mascararQueryString(query)}` : url;
  }
}

const CONTEXTOS_SEM_DADO_DE_USUARIO = new Set([
  "app",
  "browser",
  "device",
  "os",
  "runtime",
  "culture",
  "cloud_resource",
  "trace",
]);

// Mutação in-place + retorno da mesma referência: preserva o tipo exato de
// entrada (ErrorEvent continua ErrorEvent, TransactionEvent continua
// TransactionEvent) sem precisar nomear esses tipos explicitamente aqui.
export function limparEventoSentry<T extends Sentry.Event>(event: T): T {
  if (event.request) {
    if (event.request.headers) {
      const headersLimpos: Record<string, string> = {};
      for (const [nome, valor] of Object.entries(event.request.headers)) {
        headersLimpos[nome] = /^(authorization|cookie|set-cookie)$/i.test(nome)
          ? "[filtrado]"
          : String(valor);
      }
      event.request.headers = headersLimpos;
    }
    // Cookies nunca deveriam chegar aqui (dataCollection.cookies desligado
    // na origem) — removidos por completo mesmo assim, defesa em profundidade.
    delete event.request.cookies;
    // Corpo de request/response também já vem desligado na origem
    // (dataCollection.httpBodies: []); removido aqui por garantia.
    delete event.request.data;
    if (event.request.query_string) {
      event.request.query_string = mascararQueryParams(event.request.query_string);
    }
    if (event.request.url) event.request.url = mascararUrl(event.request.url);
  }

  if (event.user) {
    // Só o id técnico sobrevive — nunca email/username/ip_address, mesmo
    // que algum integration futuro volte a preenchê-los.
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }

  if (event.extra) {
    event.extra = limparObjeto(event.extra) as typeof event.extra;
  }

  if (event.contexts) {
    for (const [nome, valor] of Object.entries(event.contexts)) {
      if (CONTEXTOS_SEM_DADO_DE_USUARIO.has(nome)) continue;
      event.contexts[nome] = limparObjeto(valor) as typeof valor;
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((migalha) => ({
      ...migalha,
      message: migalha.message ? mascararTextoLivre(migalha.message) : migalha.message,
      data: migalha.data ? (limparObjeto(migalha.data) as typeof migalha.data) : migalha.data,
    }));
  }

  if (event.message) {
    event.message = mascararTextoLivre(event.message);
  }

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((valor) => ({
      ...valor,
      value: valor.value ? mascararTextoLivre(valor.value) : valor.value,
      stacktrace: valor.stacktrace
        ? {
            ...valor.stacktrace,
            frames: valor.stacktrace.frames?.map((frame) => ({
              ...frame,
              // Só chega aqui se dataCollection.stackFrameVariables ainda
              // assim tiver deixado passar algo — desligado na origem,
              // mas o dicionário de variáveis locais é exatamente onde
              // senha/cpf/telefone de uma Server Action apareceriam sem
              // aviso, então vale a limpeza redundante.
              vars: frame.vars ? (limparObjeto(frame.vars) as typeof frame.vars) : frame.vars,
            })),
          }
        : valor.stacktrace,
    }));
  }

  return event;
}

// Opções compartilhadas entre instrumentation-client.ts, sentry.server.config.ts
// e sentry.edge.config.ts — um único lugar de verdade pra dataCollection,
// release e ambiente, pra evitar que os três arquivos divirjam
// silenciosamente com o tempo. Sem tipo de retorno explícito de propósito:
// o SDK expõe tipos de opções diferentes por runtime (Browser/Node/Edge) e
// não exporta um tipo `Options` comum utilizável aqui — deixar o literal
// ser inferido estruturalmente é o que permite reusar a mesma função nos
// três Sentry.init() sem precisar nomear nenhum desses tipos.
//
// beforeSend/beforeSendTransaction ficam FORA daqui de propósito: são
// escritos inline em cada um dos três arquivos de init (ver
// src/lib/sentry-scrub.ts para a lógica de fato) porque o TypeScript só
// consegue inferir o tipo exato de `event` (ErrorEvent vs TransactionEvent)
// por tipagem contextual no próprio literal passado a Sentry.init() — uma
// função pré-empacotada aqui perderia essa inferência.
export function construirOpcoesSentry() {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,

    // Observabilidade inicial = captura de erro, não tracing de
    // performance. tracesSampleRate em 0 desliga a criação de
    // transactions (nenhum custo/volume extra); beforeSendTransaction
    // continua plugado pra quando isso for ligado no futuro.
    tracesSampleRate: 0,

    // Nunca habilitar o recurso de "Logs" nativo da Sentry aqui — nosso
    // logger central (src/lib/logger.ts) decide explicitamente o que vira
    // evento na Sentry (só error), pra não duplicar tudo que passa por
    // logger.info/debug/warn automaticamente.
    enableLogs: false,

    // Trava o que é coletado NA ORIGEM — a primeira e mais forte camada de
    // defesa (mais barata que filtrar depois: o dado nunca chega a existir
    // no evento). beforeSend/beforeSendTransaction abaixo são a segunda
    // camada, pra quando algo escapar disso (integração futura, campo
    // novo do SDK etc.) — ver src/lib/sentry-scrub.ts.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      // Query string não é desligada por completo — tags como
      // ?page=2&sort=... têm valor de debug. O que for sensível é
      // mascarado seletivamente em beforeSend, não retirado às cegas.
      urlQueryParams: true,
      // Variáveis locais de stack frame são o vazamento de PII mais fácil
      // de esquecer: uma Server Action com `senha`/`cpf`/`telefone` como
      // variável local teria esses valores anexados literalmente ao
      // evento se isso ficasse ligado (default é `true` no SDK).
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
    },
  };
}

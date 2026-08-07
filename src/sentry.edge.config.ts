import * as Sentry from "@sentry/nextjs";
import { construirOpcoesSentry } from "@/lib/sentry-options";
import { limparEventoSentry } from "@/lib/sentry-scrub";

// Carregado por src/instrumentation.ts quando NEXT_RUNTIME === "edge"
// (proxy.ts e qualquer rota marcada `runtime: "edge"`). Sem DSN, vira no-op.
Sentry.init({
  ...construirOpcoesSentry(),
  beforeSend: (event) => limparEventoSentry(event),
  beforeSendTransaction: (event) => limparEventoSentry(event),
});

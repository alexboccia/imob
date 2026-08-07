import * as Sentry from "@sentry/nextjs";
import { construirOpcoesSentry } from "@/lib/sentry-options";
import { limparEventoSentry } from "@/lib/sentry-scrub";

// Convenção do Next 15.3+/16 (instrumentation-client.ts) — substitui o
// antigo sentry.client.config.ts. Roda no browser antes da hidratação, e é
// quem captura erro de Client Component (window.onerror/unhandledrejection
// automáticos do SDK) e falha de navegação. Sem DSN, vira no-op — mesmo
// padrão de "ausente = desligado" do resto do projeto (R2/Resend/Upstash).
//
// Deliberadamente SEM Sentry.replayIntegration()/feedbackIntegration(): são
// os defaults do wizard, mas nenhum dos dois foi pedido nesta fase e
// Session Replay grava tela/DOM do usuário — superfície de PII bem maior
// do que "error tracking" pede, então fica de fora até haver uma decisão
// explícita de produto sobre isso.
Sentry.init({
  ...construirOpcoesSentry(),
  beforeSend: (event) => limparEventoSentry(event),
  beforeSendTransaction: (event) => limparEventoSentry(event),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

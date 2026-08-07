import * as Sentry from "@sentry/nextjs";
import { construirOpcoesSentry } from "@/lib/sentry-options";
import { limparEventoSentry } from "@/lib/sentry-scrub";

// Sem DSN, a Sentry inicializa como no-op (não erra, só não manda nada) —
// mesmo padrão de "ausente = feature desligada, sem quebrar o app" já
// usado pra R2/Resend/Upstash neste projeto.
Sentry.init({
  ...construirOpcoesSentry(),
  beforeSend: (event) => limparEventoSentry(event),
  beforeSendTransaction: (event) => limparEventoSentry(event),
});

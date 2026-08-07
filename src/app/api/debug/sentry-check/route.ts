import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { temPapel, PAPEIS_GESTAO_CONFIGURACOES } from "@/lib/authorization";
import { logger } from "@/lib/logger";

// Mecanismo pra confirmar que a integração com a Sentry está de fato
// mandando evento — sem depender de esperar um bug de verdade acontecer.
// Liberado sem restrição fora de produção; em produção, só quem tem papel
// de gestão de configurações (mesmo critério já usado pra outras áreas
// sensíveis do painel) pode disparar.
//
// GET /api/debug/sentry-check          → captureMessage (não derruba a
//                                         requisição, sempre 200)
// GET /api/debug/sentry-check?throw=1  → também lança uma exceção de
//                                         propósito, pra testar a captura
//                                         automática via onRequestError
//                                         (src/instrumentation.ts) — a
//                                         resposta vira 500, como qualquer
//                                         erro não tratado de verdade.
export async function GET(request: Request) {
  const ambiente = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development";
  const emProducao = ambiente === "production";

  if (emProducao) {
    const session = await auth();
    if (!temPapel(session?.user.role, PAPEIS_GESTAO_CONFIGURACOES)) {
      return NextResponse.json({ erro: "Não autorizado." }, { status: 403 });
    }
  }

  Sentry.captureMessage("Teste manual de integração Sentry (rota de diagnóstico)", "info");
  logger.info("Teste manual de integração Sentry disparado", {
    route: "/api/debug/sentry-check",
    modulo: "observabilidade",
  });

  const url = new URL(request.url);
  if (url.searchParams.get("throw") === "1") {
    throw new Error(
      "Erro de teste da rota /api/debug/sentry-check — ignore se não foi você quem disparou."
    );
  }

  return NextResponse.json({
    ok: true,
    mensagem:
      "Evento de teste enviado via captureMessage. Adicione ?throw=1 nesta mesma rota " +
      "pra também testar a captura automática de erro não tratado.",
    ambiente,
    dsnConfigurado: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  });
}

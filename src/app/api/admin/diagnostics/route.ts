import { NextResponse } from "next/server";
import { verificarSaudeCompleta } from "@/lib/health";
import { auth } from "@/lib/auth";
import { temPapel, PAPEIS_GESTAO_CONFIGURACOES } from "@/lib/authorization";

// Diagnóstico aprofundado — checa PostgreSQL, R2 (HeadBucket de verdade)
// e presença de configuração da Resend. Deliberadamente SEPARADO de
// /api/health: essas chamadas custam mais (rede pro R2) e não devem
// rodar em toda requisição de um load balancer/uptime monitor — só sob
// demanda, de propósito, por alguém investigando um problema.
//
// Mesmo critério de acesso da rota de teste da Sentry
// (src/app/api/debug/sentry-check/route.ts): liberado fora de produção,
// exige papel de gestão de configurações (OWNER/ADMIN) em produção.
export async function GET() {
  const ambiente = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development";
  const emProducao = ambiente === "production";

  if (emProducao) {
    const session = await auth();
    if (!temPapel(session?.user.role, PAPEIS_GESTAO_CONFIGURACOES)) {
      return NextResponse.json({ erro: "Não autorizado." }, { status: 403 });
    }
  }

  const resultado = await verificarSaudeCompleta();

  return NextResponse.json(resultado, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

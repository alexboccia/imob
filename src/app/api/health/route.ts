import { NextResponse } from "next/server";
import { verificarSaudeBasica } from "@/lib/health";
import { logger } from "@/lib/logger";

// Health check público — usado por load balancer/uptime monitor (ex: a
// própria DigitalOcean App Platform pode ser configurada pra bater aqui).
// Corpo de resposta é deliberadamente mínimo: nunca URL de banco, nome
// interno, credencial ou stack trace — só o suficiente pra dizer "de pé"
// ou "não". Detalhe de verdade fica em /api/admin/diagnostics (protegido).
export async function GET() {
  const { saudavel } = await verificarSaudeBasica();

  if (!saudavel) {
    logger.error("Health check falhou: PostgreSQL indisponível", undefined, {
      route: "/api/health",
      modulo: "health",
    });
  }

  return NextResponse.json(
    { status: saudavel ? "ok" : "error" },
    { status: saudavel ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}

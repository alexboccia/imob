import { NextRequest, NextResponse } from "next/server";
import { getOrganizationBySlug } from "@/lib/tenant";
import { obterKvStore } from "@/lib/kv-store";
import { verificarLimiteAnalytics } from "@/lib/rate-limit";
import { obterIpCliente } from "@/lib/client-ip";
import { registrarEventoAnalytics } from "@/lib/analytics-tracking";
import { logger } from "@/lib/logger";

// Endpoint público de tracking (Fase 6).
//
// Fora da árvore [orgSlug] pelo mesmo motivo de /api/imoveis/sugestoes:
// é chamado por fetch/sendBeacon do navegador, que não tem params de
// rota. O orgSlug vem no corpo e é SEMPRE re-resolvido no servidor —
// nunca se aceita organizationId vindo do browser.
//
// -----------------------------------------------------------------------
// RESPOSTA SEMPRE 202, MESMO QUANDO NADA É GRAVADO
// -----------------------------------------------------------------------
// Um endpoint público de analytics não pode virar oráculo: responder
// 404 pra imóvel inexistente e 202 pra existente permitiria enumerar o
// catálogo de qualquer organização, inclusive rascunhos. E, do lado do
// cliente, NADA depende desta resposta — o beacon é disparado e
// esquecido. 202 uniforme (exceto rate limit, que precisa mesmo dizer
// 429) é o comportamento certo pra ambos.
//
// -----------------------------------------------------------------------
// CSRF / CORS
// -----------------------------------------------------------------------
// Sem CORS permissivo: nenhum header Access-Control-* é emitido, então o
// navegador já bloqueia leitura cross-origin por padrão. Este endpoint
// também não usa cookie/sessão pra decidir nada e não altera estado do
// usuário — não há sessão pra "montar" num ataque CSRF clássico.
// A defesa relevante aqui é contra INFLAÇÃO de métrica a partir de outro
// site, e pra isso a checagem de Origin abaixo é suficiente e barata;
// requisição sem Origin (sendBeacon de alguns browsers, curl) é aceita
// porque o rate limit + deduplicação já limitam o estrago.
export const runtime = "nodejs";

function mesmaOrigem(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  // Sem Origin: não dá pra afirmar que é cross-site. Deixa passar (o
  // rate limit segura o volume) em vez de perder eventos legítimos.
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // 202 uniforme: o cliente nunca aprende nada com a resposta.
  const aceito = () => NextResponse.json({ ok: true }, { status: 202 });

  if (!mesmaOrigem(request)) return aceito();

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return aceito();
  }
  if (typeof corpo !== "object" || corpo === null) return aceito();

  const { orgSlug, propertyId, type, placement, visitorId } = corpo as Record<string, unknown>;
  if (typeof orgSlug !== "string" || orgSlug === "") return aceito();

  const organization = await getOrganizationBySlug(orgSlug);
  // Organização inexistente ou suspensa não acumula métrica — mesma
  // regra já aplicada ao autocomplete público.
  if (!organization || !organization.active) return aceito();

  const store = obterKvStore();
  if (store) {
    const limite = await verificarLimiteAnalytics(store, {
      ip: obterIpCliente(request.headers),
      organizationId: organization.id,
    });
    if (!limite.permitido) {
      return NextResponse.json(
        { ok: false },
        { status: 429, headers: { "Retry-After": String(limite.retryAfterSegundos) } }
      );
    }
  }

  try {
    await registrarEventoAnalytics({
      organizationId: organization.id,
      propertyId,
      type,
      placement,
      visitorId,
    });
  } catch (erro) {
    // FAIL-OPEN, o princípio inegociável desta fase: se o banco cair, o
    // visitante não pode nem perceber. Loga e devolve 202 — a métrica se
    // perde, a experiência não.
    logger.error("Falha ao registrar evento de analytics", erro, {
      route: "/api/analytics/evento",
      modulo: "analytics",
    });
  }

  return aceito();
}

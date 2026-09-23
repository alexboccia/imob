import { NextRequest, NextResponse } from "next/server";
import { getOrganizationBySlug } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { buscarImoveisComparacao } from "@/lib/comparador-data";
import { interpretarPedidoFavoritos } from "@/lib/favoritos-pedido";
import { logger } from "@/lib/logger";

// Resolve os imóveis de uma comparação (Fase 59).
//
// Gêmeo de /api/imoveis/favoritos, com as MESMAS proteções e pelos
// mesmos motivos — só muda o conjunto de colunas devolvido:
//
// - POST, não GET: a seleção é do visitante e não vai para URL, log de
//   acesso nem cache compartilhado. `no-store` pelo mesmo motivo.
// - orgSlug do corpo é sempre RE-RESOLVIDO; nunca se aceita
//   organizationId vindo do navegador.
// - Nada é gravado: nem evento, nem pessoa, nem lead.
// - Id inexistente, de outra organização ou sem ficha pública: ausente
//   da resposta, igual a qualquer outro.
// - Organização inexistente ou suspensa: lista vazia, sem 404.
//
// Reusa `interpretarPedidoFavoritos`: o corpo é o mesmo (orgSlug + ids
// com o mesmo teto), e duplicar o schema só criaria duas validações para
// manter em sincronia.
export const runtime = "nodejs";

const SEM_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400, headers: SEM_CACHE });
  }
  const pedido = interpretarPedidoFavoritos(corpo);
  if (!pedido) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400, headers: SEM_CACHE });
  }

  const organization = await getOrganizationBySlug(pedido.orgSlug);
  if (!organization || !organization.active || pedido.ids.length === 0) {
    return NextResponse.json({ imoveis: [] }, { headers: SEM_CACHE });
  }
  const organizationId = organization.id;

  try {
    const imoveis = await withOrganization(organizationId, () =>
      buscarImoveisComparacao(organizationId, pedido.ids)
    );
    return NextResponse.json({ imoveis }, { headers: SEM_CACHE });
  } catch (erro) {
    logger.error("Falha ao carregar comparação", erro, { modulo: "comparador" });
    return NextResponse.json({ erro: "Falha ao carregar." }, { status: 500, headers: SEM_CACHE });
  }
}

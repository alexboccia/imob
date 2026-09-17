import { NextRequest, NextResponse } from "next/server";
import { getOrganizationBySlug } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { buscarImoveisFavoritos } from "@/lib/favoritos-data";
import { interpretarPedidoFavoritos } from "@/lib/favoritos-pedido";
import { logger } from "@/lib/logger";

// Resolve a lista de favoritos do visitante (Fase 49).
//
// Os favoritos moram no navegador; só os DADOS PÚBLICOS dos imóveis
// moram aqui. Fora da árvore [orgSlug] pelo mesmo motivo de
// /api/imoveis/sugestoes: é chamado por fetch, e o orgSlug do corpo é
// sempre re-resolvido — nunca se aceita organizationId do navegador.
//
// - POST, não GET: a seleção de ids é do visitante e não deve ir para
//   URL, log de acesso nem cache compartilhado. `no-store` pelo mesmo
//   motivo.
// - Nada é gravado: nem evento, nem pessoa, nem lead.
// - Id inexistente, de outra organização ou sem ficha pública: ausente
//   da resposta, igual a qualquer outro — o endpoint não é oráculo.
// - Organização inexistente ou suspensa: lista vazia, sem 404.
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
      buscarImoveisFavoritos(organizationId, pedido.ids)
    );
    return NextResponse.json({ imoveis }, { headers: SEM_CACHE });
  } catch (erro) {
    logger.error("Falha ao carregar favoritos", erro, {
      route: "/api/imoveis/favoritos",
      modulo: "site-publico",
    });
    return NextResponse.json(
      { erro: "Não foi possível carregar os favoritos." },
      { status: 500, headers: SEM_CACHE }
    );
  }
}

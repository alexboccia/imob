import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationBySlug } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { normalizarBusca } from "@/lib/pagination";
import { formatarPreco } from "@/lib/format";

// Autocomplete do campo de busca pública (/imoveis) — mesma lógica de
// texto de src/app/[orgSlug]/imoveis/page.tsx (título/bairro por
// `contains`, código por igualdade exata), só que com `take` pequeno e
// sem paginação/contagem, já que é sugestão, não listagem.
//
// Fora da árvore [orgSlug] de propósito (é chamado via fetch client-side,
// não tem acesso a params de rota) — orgSlug chega por query string, então
// é input do navegador como qualquer outro: sempre resolvido e revalidado
// aqui, nunca aceito como organizationId direto. Ver plano, seção "Modelo
// de isolamento e fronteira de segurança".
export async function GET(request: NextRequest) {
  const busca = normalizarBusca(request.nextUrl.searchParams.get("busca") ?? undefined);
  const orgSlug = request.nextUrl.searchParams.get("orgSlug") ?? "";
  if (!busca || !orgSlug) {
    return NextResponse.json({ sugestoes: [] });
  }

  const organization = await getOrganizationBySlug(orgSlug);

  // Organização inexistente ou suspensa não deve continuar servindo
  // autocomplete pro site público.
  if (!organization || !organization.active) {
    return NextResponse.json({ sugestoes: [] });
  }
  const organizationId = organization.id;

  const digitosBusca = busca.replace(/\D/g, "");
  const buscaCodigo = digitosBusca ? Number(digitosBusca) : NaN;

  const sugestoes = await withOrganization(organizationId, () =>
    prisma.property.findMany({
      where: {
        organizationId,
        status: "AVAILABLE",
        OR: [
          { title: { contains: busca, mode: "insensitive" } },
          { neighborhood: { contains: busca, mode: "insensitive" } },
          ...(Number.isInteger(buscaCodigo) ? [{ code: buscaCodigo }] : []),
        ],
      },
      select: {
        id: true,
        title: true,
        neighborhood: true,
        city: true,
        price: true,
        rentPrice: true,
        media: {
          where: { type: "PHOTO" },
          orderBy: [{ isCover: "desc" }, { order: "asc" }],
          take: 1,
          select: { url: true },
        },
      },
      take: 6,
      orderBy: { createdAt: "desc" },
    })
  );

  // Decimal do Prisma não deve atravessar a fronteira JSON cru (mesmo
  // problema já conhecido do projeto com preço em outras telas) —
  // formata pra string no servidor.
  const resultado = sugestoes.map((imovel) => ({
    id: imovel.id,
    title: imovel.title,
    neighborhood: imovel.neighborhood,
    city: imovel.city,
    precoFormatado: imovel.price
      ? formatarPreco(imovel.price)
      : imovel.rentPrice
        ? `${formatarPreco(imovel.rentPrice)}/mês`
        : null,
    fotoUrl: imovel.media[0]?.url ?? null,
  }));

  return NextResponse.json(
    { sugestoes: resultado },
    { headers: { "Cache-Control": "no-store" } }
  );
}

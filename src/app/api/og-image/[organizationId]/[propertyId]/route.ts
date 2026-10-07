import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { fichaEhPublica } from "@/lib/visibilidade-imovel";
import { transcodificarParaOgImagem } from "@/lib/og-imagem";

// Foto de capa para og:image (MKT-005). PÚBLICA de propósito — quem
// busca isto é o crawler de preview do WhatsApp/Facebook/etc, que nunca
// tem sessão (seção 24 do pedido: "crawler não é usuário logado"). Por
// isso esta rota NÃO chama auth()/requireOrganizationId() como as rotas
// administrativas — a autorização aqui é a MESMA regra que já governa a
// ficha pública (fichaEhPublica), não a sessão do painel.
//
// organizationId + propertyId vêm os dois na própria URL (gerada só por
// urlOgImagemDoImovel, dentro de generateMetadata — nunca por input
// externo arbitrário): escopar a query pelos dois juntos impede que um
// propertyId de um tenant seja servido sob o organizationId de outro
// (seção 26 — nunca um findUnique({id}) sozinho quando o contrato exige
// escopo adicional).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; propertyId: string }> }
) {
  const { organizationId, propertyId } = await params;

  const imovel = await withOrganization(organizationId, () =>
    prisma.property.findUnique({
      where: { id: propertyId, organizationId },
      select: {
        status: true,
        media: {
          where: { type: "PHOTO" },
          orderBy: [{ isCover: "desc" }, { order: "asc" }],
          take: 1,
          select: { url: true },
        },
      },
    })
  );

  // Mesma regra da própria ficha pública (fichaEhPublica) — um imóvel
  // DRAFT/INACTIVE ou de outra organização não tem foto exposta aqui,
  // exatamente como não tem ficha pública (seção 25: metadata não pode
  // tornar acessível o que a página pública já esconde).
  if (!imovel || !fichaEhPublica(imovel.status)) {
    return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  }

  const capa = imovel.media[0]?.url;
  if (!capa) {
    return NextResponse.json({ erro: "Este imóvel não tem foto." }, { status: 404 });
  }

  const resultado = await transcodificarParaOgImagem(capa);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.erro }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(resultado.bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      // Cache de um dia: a foto de capa raramente muda, e crawlers
      // sociais já cacheiam por conta própria (seção 31) — isto só evita
      // reprocessar a cada visita enquanto ela não muda.
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}

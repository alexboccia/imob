import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { buscarBranding } from "@/lib/branding";
import { temWhatsApp } from "@/lib/whatsapp";
import { precosDoImovel } from "@/lib/imovel-precos";
import { formatarPreco, formatarLocalizacaoImovel } from "@/lib/format";
import { montarItensUnidade } from "@/lib/caracteristicas-ficha";
import {
  formatoAnuncioPorId,
  finalidadeAnuncioAmbigua,
  finalidadeAnuncioValida,
  opcoesFinalidadeAnuncio,
  precoParaFinalidadeAnuncio,
  midiaPertenceAoImovel,
  FINALIDADE_ANUNCIO_LABEL,
  type FinalidadeAnuncio,
} from "@/lib/anuncio-imovel";
import { renderizarAnuncio } from "@/lib/anuncio-imovel-render";

// "Gerar anúncio" (MKT-001) — leitura: compõe uma imagem a partir de
// dados que o chamador já tem direito de ver na própria ficha do imóvel
// (mesmo escopo de autorização de /app/imoveis/[id], seção Q-T da
// investigação: qualquer sessão da organização, sem papel extra). Nenhum
// dado novo é escrito — gerar o criativo não muda o Property.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const { id: propertyId } = await params;
  const { searchParams } = new URL(request.url);
  const mediaId = searchParams.get("mediaId");
  const formatoId = searchParams.get("formato");
  const finalidadeParam = searchParams.get("finalidade");

  const formato = formatoId ? formatoAnuncioPorId(formatoId) : null;
  if (!formato) {
    return NextResponse.json({ erro: "Formato inválido." }, { status: 400 });
  }
  if (!mediaId) {
    return NextResponse.json({ erro: "Selecione uma foto." }, { status: 400 });
  }

  const organizationId = await requireOrganizationId();

  const [imovel, config, branding, organization] = await withOrganization(
    organizationId,
    () =>
      Promise.all([
        prisma.property.findUnique({
          where: { id: propertyId, organizationId },
          select: {
            id: true,
            title: true,
            purpose: true,
            neighborhood: true,
            city: true,
            state: true,
            price: true,
            rentPrice: true,
            totalArea: true,
            privateArea: true,
            bedrooms: true,
            suites: true,
            bathrooms: true,
            parkingSpots: true,
            propertyFeatures: true,
            media: {
              where: { type: "PHOTO" },
              orderBy: [{ isCover: "desc" }, { order: "asc" }],
              select: { id: true, url: true, propertyId: true },
            },
          },
        }),
        buscarConfiguracaoContato(organizationId),
        buscarBranding(organizationId),
        prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      ])
  );

  if (!imovel || !organization) {
    return NextResponse.json({ erro: "Imóvel não encontrado." }, { status: 404 });
  }

  // mediaId vem da query string — nunca confiar nele sem reconfirmar que
  // pertence a ESTE imóvel (que por sua vez já veio escopado por
  // organizationId acima). Um id de mídia de outro tenant/imóvel não
  // aparece em imovel.media, então midiaPertenceAoImovel recusa mesmo sem
  // consulta extra.
  const midiaSelecionada = imovel.media.find((m) => m.id === mediaId);
  if (!midiaPertenceAoImovel(midiaSelecionada, imovel.id)) {
    return NextResponse.json({ erro: "Foto inválida para este imóvel." }, { status: 400 });
  }

  let finalidade: FinalidadeAnuncio;
  if (finalidadeAnuncioAmbigua(imovel.purpose)) {
    if (!finalidadeAnuncioValida(imovel.purpose, finalidadeParam)) {
      return NextResponse.json(
        {
          erro: "Este imóvel aceita venda e aluguel — escolha a finalidade do anúncio.",
          opcoes: opcoesFinalidadeAnuncio(imovel.purpose),
        },
        { status: 400 }
      );
    }
    finalidade = finalidadeParam;
  } else {
    const [unica] = opcoesFinalidadeAnuncio(imovel.purpose);
    if (!unica) {
      return NextResponse.json({ erro: "Finalidade do imóvel inválida." }, { status: 400 });
    }
    finalidade = unica;
  }

  const precos = precosDoImovel(imovel);
  const preco = precoParaFinalidadeAnuncio(finalidade, precos);
  const itens = montarItensUnidade({
    totalArea: imovel.totalArea,
    privateArea: imovel.privateArea,
    bedrooms: imovel.bedrooms,
    suites: imovel.suites,
    bathrooms: imovel.bathrooms,
    parkingSpots: imovel.parkingSpots,
    propertyFeatures: [],
  })
    // Só os atributos estruturais — seção 8 do pedido: anúncio, não ficha
    // técnica completa. Passar propertyFeatures: [] acima já garante que
    // nenhum item de catálogo é gerado; o filtro aqui é defesa redundante
    // caso montarItensUnidade mude no futuro.
    .filter((item) => item.icone !== "catalogo")
    .map((item) => item.texto);

  const nomeOrganizacao = branding.displayName ?? organization.name;
  const whatsapp = temWhatsApp(config.whatsapp) ? config.whatsapp : null;

  const resultado = await renderizarAnuncio(
    formato,
    {
      itens,
      finalidadeLabel: FINALIDADE_ANUNCIO_LABEL[finalidade],
      precoFormatado: preco !== null ? formatarPreco(preco) : null,
      localizacao: formatarLocalizacaoImovel(imovel.neighborhood, imovel.city, imovel.state),
      nomeOrganizacao,
      whatsapp,
    },
    {
      fotoUrl: midiaSelecionada!.url,
      logoUrl: config.logo,
    }
  );

  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.erro }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(resultado.bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
    },
  });
}

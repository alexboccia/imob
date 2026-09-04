import Image from "next/image";
import { FormularioContato } from "@/components/FormularioContato";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IconeWhatsApp } from "@/components/icons";
import { formatarPreco } from "@/lib/format";

// Card lateral de conversão do detalhe do imóvel. A hierarquia é
// deliberada — preço, CTA de WhatsApp, divisor, formulário — porque é
// esse o caminho que o visitante percorre; qualquer coisa entre o preço e
// o CTA compete com a conversão.
//
// Extraído do detalhe porque a página de lançamento precisa do mesmo
// card, com os mesmos dois modos (com e sem WhatsApp configurado).

export type ValoresImovel = {
  price: unknown;
  rentPrice: unknown;
  condoFee: unknown;
  propertyTax: unknown;
  purpose: string;
};

export type ResponsavelImovel = {
  user: { name: string; avatarUrl: string | null };
} | null;

// Valores só aparecem quando existem de verdade. Nada de "sob consulta"
// inventado para condomínio/IPTU: sem o campo preenchido, a linha some.
export function ValoresDoImovel({ imovel }: { imovel: ValoresImovel }) {
  const ambos = imovel.purpose === "SALE_AND_RENT";
  return (
    <div className="space-y-2">
      {imovel.price != null && (
        <div>
          {ambos && (
            <Badge variant="secondary" className="mb-1">
              Para comprar
            </Badge>
          )}
          <p className="text-3xl font-semibold tracking-tight text-gray-900">
            {formatarPreco(imovel.price)}
          </p>
        </div>
      )}
      {imovel.rentPrice != null && (
        <div>
          {ambos && (
            <Badge variant="secondary" className="mb-1">
              Para alugar
            </Badge>
          )}
          <p className="text-3xl font-semibold tracking-tight text-gray-900">
            {formatarPreco(imovel.rentPrice)}
            <span className="text-sm font-normal text-gray-500">/mês</span>
          </p>
        </div>
      )}
      {(imovel.condoFee != null || imovel.propertyTax != null) && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-sm text-gray-500">
          {imovel.condoFee != null && (
            <div className="flex gap-1.5">
              <dt>Condomínio:</dt>
              <dd>{formatarPreco(imovel.condoFee)}</dd>
            </div>
          )}
          {imovel.propertyTax != null && (
            <div className="flex gap-1.5">
              <dt>IPTU:</dt>
              <dd>{formatarPreco(imovel.propertyTax)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

export function CardContatoImovel({
  imovel,
  imovelId,
  orgSlug,
  whatsappHref,
  mensagemFormulario,
  responsavel,
  idFormulario,
}: {
  imovel: ValoresImovel;
  imovelId: string;
  orgSlug: string;
  // null quando o tenant não configurou WhatsApp (nem no imóvel, nem nas
  // configurações). Nesse caso NENHUM botão é renderizado: o formulário
  // logo abaixo já é o canal, e um botão a mais aqui só empurraria ele
  // pra baixo.
  whatsappHref: string | null;
  mensagemFormulario: string;
  responsavel: ResponsavelImovel;
  idFormulario: string;
}) {
  return (
    <Card className="h-fit lg:sticky lg:top-[calc(var(--site-header-height,88px)+1rem)]">
      <CardContent className="space-y-4">
        <ValoresDoImovel imovel={imovel} />

        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({
              size: "lg",
              className:
                "w-full bg-whatsapp-brand text-white hover:bg-whatsapp-brand-hover active:bg-whatsapp-brand-active",
            })}
          >
            <IconeWhatsApp className="size-5" />
            Falar no WhatsApp
          </a>
        )}

        {/* Responsável pelo anúncio: dado que a página já exibia, mantido
            como está e em formato compacto pra não separar o preço do
            formulário. Nada NOVO de OrganizationMember/User é publicado
            aqui — publicar corretor de propósito depende de um campo de
            autorização que o schema ainda não tem. */}
        {responsavel && (
          <div className="flex items-center gap-3 border-t pt-4">
            <span className="relative size-11 shrink-0 overflow-hidden rounded-full border bg-gray-100">
              {responsavel.user.avatarUrl ? (
                <Image
                  src={responsavel.user.avatarUrl}
                  alt={responsavel.user.name}
                  fill
                  sizes="44px"
                  className="object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center bg-primary font-semibold text-primary-foreground">
                  {responsavel.user.name.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {responsavel.user.name}
              </span>
              <span className="block text-xs text-gray-500">
                Corretor(a) responsável
              </span>
            </span>
          </div>
        )}

        <div id={idFormulario} className="space-y-3 border-t pt-4 scroll-mt-24">
          <p className="text-sm font-medium">Enviar mensagem</p>
          <FormularioContato
            imovelId={imovelId}
            mensagemPreenchida={mensagemFormulario}
            idPrefixo="aside-"
            orgSlug={orgSlug}
          />
        </div>
      </CardContent>
    </Card>
  );
}

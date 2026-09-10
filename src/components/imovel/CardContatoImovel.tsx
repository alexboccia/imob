import { FormularioContato } from "@/components/FormularioContato";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IconeWhatsApp } from "@/components/icons";
import { RastreioCliqueWhatsApp } from "@/components/analytics/RastreioCliqueWhatsApp";
import { formatarPreco } from "@/lib/format";

// Card lateral de conversão do detalhe do imóvel. A hierarquia é
// deliberada — preço, CTA de WhatsApp, divisor, formulário — porque é
// esse o caminho que o visitante percorre; qualquer coisa entre o preço e
// o CTA compete com a conversão.
//
// Extraído do detalhe porque a página de lançamento precisa do mesmo
// card, com os mesmos dois modos (com e sem WhatsApp configurado).
//
// A identidade do corretor MOROU aqui, entre o CTA e o formulário. Saiu
// para CardCorretorImovel, na coluna de conteúdo: ali ela tem largura
// para respirar e aqui a hierarquia de conversão volta a ser só preço →
// CTA → formulário. Não é duplicação removida, é mudança de lugar — ver
// o cabeçalho daquele arquivo.

export type ValoresImovel = {
  price: unknown;
  rentPrice: unknown;
  condoFee: unknown;
  propertyTax: unknown;
  purpose: string;
};



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
  idFormulario: string;
}) {
  return (
    <Card className="h-fit lg:sticky lg:top-[calc(var(--site-header-height,88px)+1rem)]">
      <CardContent className="space-y-4">
        <ValoresDoImovel imovel={imovel} />

        {whatsappHref && (
          // A âncora abaixo está intocada — mesmo href, target, rel e
          // classes de antes. O wrapper só escuta o clique borbulhando.
          <RastreioCliqueWhatsApp orgSlug={orgSlug} imovelId={imovelId} placement="SIDEBAR">
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
          </RastreioCliqueWhatsApp>
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

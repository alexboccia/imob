import { FormularioContato } from "@/components/FormularioContato";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IconeWhatsApp } from "@/components/icons";
import { RastreioCliqueWhatsApp } from "@/components/analytics/RastreioCliqueWhatsApp";
import { ValoresDoImovel, type ValoresImovel } from "@/components/imovel/ValoresDoImovel";

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
//
// Fase 43 — o cabeçalho da ficha passou a mostrar os mesmos valores no
// desktop. A repetição é intencional: lá é a decisão imediata, aqui é a
// conversão que acompanha a leitura. Os dois usam ValoresDoImovel.

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
    <Card data-card-contato className="h-fit lg:sticky lg:top-[calc(var(--site-header-height,88px)+1rem)]">
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

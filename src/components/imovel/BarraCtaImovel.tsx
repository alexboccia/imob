import { buttonVariants } from "@/components/ui/button";
import { IconeWhatsApp } from "@/components/icons";
import { RastreioCliqueWhatsApp } from "@/components/analytics/RastreioCliqueWhatsApp";
import { formatarPreco } from "@/lib/format";

// Barra de conversão fixa no rodapé, só no mobile. No desktop o card
// lateral fica visível o tempo todo (sticky); no celular ele vive lá
// embaixo, depois de galeria, descrição, características e mapa — sem
// isto o visitante precisa rolar a página inteira de volta pra fazer
// contato.
//
// Server Component: é posicionamento CSS puro, sem estado. O botão
// secundário é uma âncora pro formulário que já existe no card, não uma
// segunda cópia do formulário.
//
// A página reserva espaço equivalente no fim do conteúdo (pb-24 lg:pb-0),
// então a barra nunca cobre o final da página nem o rodapé.
export function BarraCtaImovel({
  price,
  rentPrice,
  whatsappHref,
  orgSlug,
  imovelId,
  hrefFormulario,
}: {
  price: unknown;
  rentPrice: unknown;
  // null = tenant sem WhatsApp configurado: a barra continua existindo,
  // com o contato pelo formulário ocupando a largura toda.
  whatsappHref: string | null;
  orgSlug: string;
  imovelId: string;
  hrefFormulario: string;
}) {
  const valor = price ?? rentPrice;
  const sufixo = price == null && rentPrice != null ? "/mês" : "";

  return (
    <div
      data-cta-imovel
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm lg:hidden"
      // Respeita a barra de gestos do iOS — sem isto o botão fica
      // parcialmente embaixo dela em iPhones sem botão físico.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        {valor != null && (
          <p className="min-w-0 shrink text-base font-semibold text-gray-900">
            <span className="truncate">{formatarPreco(valor)}</span>
            {sufixo && (
              <span className="text-xs font-normal text-gray-500">{sufixo}</span>
            )}
          </p>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <a
            href={hrefFormulario}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Contato
          </a>
          {whatsappHref && (
            // aria-label e href preservados byte a byte — o wrapper não
            // participa da árvore de acessibilidade (display: contents).
            <RastreioCliqueWhatsApp orgSlug={orgSlug} imovelId={imovelId} placement="MOBILE_BAR">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Falar no WhatsApp sobre este imóvel"
                className={buttonVariants({
                  size: "lg",
                  className:
                    "bg-whatsapp-brand text-white hover:bg-whatsapp-brand-hover active:bg-whatsapp-brand-active",
                })}
              >
                <IconeWhatsApp className="size-5" />
                WhatsApp
              </a>
            </RastreioCliqueWhatsApp>
          )}
        </div>
      </div>
    </div>
  );
}

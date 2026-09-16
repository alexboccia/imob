import { buttonVariants } from "@/components/ui/button";
import { IconeWhatsApp } from "@/components/icons";
import { RastreioCliqueWhatsApp } from "@/components/analytics/RastreioCliqueWhatsApp";
import { precosPublicos } from "@/lib/valores-publicos";

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
  purpose,
  whatsappHref,
  orgSlug,
  imovelId,
  hrefFormulario,
}: {
  price: unknown;
  rentPrice: unknown;
  purpose: string;
  // null = tenant sem WhatsApp configurado: a barra continua existindo,
  // com o contato pelo formulário ocupando a largura toda.
  whatsappHref: string | null;
  orgSlug: string;
  imovelId: string;
  hrefFormulario: string;
}) {
  // Fase 43 — mesma regra do card lateral e do cabeçalho. Antes era
  // `price ?? rentPrice`: num imóvel de venda E locação o aluguel sumia
  // da barra. Com os dois valores, eles empilham em duas linhas menores —
  // o "/mês" já distingue o aluguel, e o rótulo completo vai para o
  // leitor de tela sem disputar a largura dos botões em 320px.
  const precos = precosPublicos({ price, rentPrice, purpose });
  const dois = precos.length > 1;

  return (
    <div
      data-cta-imovel
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm lg:hidden"
      // Respeita a barra de gestos do iOS — sem isto o botão fica
      // parcialmente embaixo dela em iPhones sem botão físico.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        {precos.length > 0 && (
          <div data-precos-barra className="min-w-0 shrink">
            {precos.map((preco) => (
              <p
                key={preco.chave}
                className={`font-semibold whitespace-nowrap text-gray-900 ${
                  dois ? "text-sm leading-5" : "text-base"
                }`}
              >
                {preco.rotulo && <span className="sr-only">{preco.rotulo}: </span>}
                <span>{preco.valor}</span>
                {preco.sufixo && (
                  <span className="text-xs font-normal text-gray-500">{preco.sufixo}</span>
                )}
              </p>
            ))}
          </div>
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

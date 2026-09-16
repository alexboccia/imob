import { buttonVariants } from "@/components/ui/button";
import { IconeWhatsApp } from "@/components/icons";
import { RastreioCliqueWhatsApp } from "@/components/analytics/RastreioCliqueWhatsApp";
import { ValoresDoImovel, type ValoresImovel } from "@/components/imovel/ValoresDoImovel";

// Bloco comercial do cabeçalho da ficha (Fase 43) — só a partir de lg.
//
// No desktop, preço e ação precisam estar na primeira tela junto com o
// título e a galeria. O card lateral continua existindo (e continua
// mostrando o preço): ele começa abaixo da galeria e acompanha a leitura;
// este bloco responde "quanto custa e como falo" antes de qualquer
// rolagem.
//
// Abaixo de lg ele não existe: ali a barra fixa do rodapé já carrega
// preço e contato, e um terceiro bloco comercial seria ruído.
//
// CTA: o MESMO href de WhatsApp dos outros CTAs (mesma resolução de
// número, mesma mensagem com o imóvel). Sem WhatsApp configurado, a ação
// leva ao formulário do card lateral — que existe sempre — em vez de
// inventar um canal.
export function BlocoComercialImovel({
  imovel,
  imovelId,
  orgSlug,
  whatsappHref,
  hrefFormulario,
}: {
  imovel: ValoresImovel;
  imovelId: string;
  orgSlug: string;
  whatsappHref: string | null;
  /** Âncora do formulário do card lateral, ex.: "#contato-imovel". */
  hrefFormulario: string;
}) {
  const classeCta = "w-full";

  return (
    <div
      data-bloco-comercial
      className="hidden shrink-0 space-y-4 lg:block lg:w-80 xl:w-96"
    >
      <ValoresDoImovel imovel={imovel} variante="cabecalho" />

      {whatsappHref ? (
        <RastreioCliqueWhatsApp orgSlug={orgSlug} imovelId={imovelId} placement="HEADER">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({
              size: "lg",
              className: `${classeCta} bg-whatsapp-brand text-white hover:bg-whatsapp-brand-hover active:bg-whatsapp-brand-active`,
            })}
          >
            <IconeWhatsApp className="size-5" />
            Falar no WhatsApp
          </a>
        </RastreioCliqueWhatsApp>
      ) : (
        <a href={hrefFormulario} className={buttonVariants({ size: "lg", className: classeCta })}>
          Tenho interesse
        </a>
      )}
    </div>
  );
}

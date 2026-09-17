import { FormularioContato } from "@/components/FormularioContato";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IconeWhatsApp } from "@/components/icons";
import { RastreioCliqueWhatsApp } from "@/components/analytics/RastreioCliqueWhatsApp";
import { ValoresDoImovel, type ValoresImovel } from "@/components/imovel/ValoresDoImovel";
import { TITULO_BLOCO } from "@/lib/site-typography";

// Card lateral de conversão do detalhe do imóvel. A hierarquia é
// deliberada — preço, CTA de WhatsApp, divisor, formulário — porque é
// esse o caminho que o visitante percorre; qualquer coisa entre o preço e
// o CTA compete com a conversão.
//
// Extraído do detalhe porque a página de lançamento precisa do mesmo
// card, com os mesmos dois modos (com e sem WhatsApp configurado).
//
// Fase 51 — a hierarquia passou a ser preço/CTAs → corretor responsável
// → "Receba mais informações" (o formulário) → política de privacidade.
// O corretor está aqui de novo (saíra para a coluna de conteúdo na Fase
// 43): quem atende vem logo antes de quem pergunta. A coluna de conteúdo
// não o repete.
//
// Fase 43 — o cabeçalho da ficha passou a mostrar os mesmos valores no
// desktop. A repetição é intencional: lá é a decisão imediata, aqui é a
// conversão que acompanha a leitura. Os dois usam ValoresDoImovel.

export function CardContatoImovel({
  imovel,
  imovelId,
  orgSlug,
  basePath,
  whatsappHref,
  mensagemFormulario,
  idFormulario,
  corretor,
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
  basePath: string;
  /** O corretor responsável, quando ele publicou o perfil. */
  corretor?: React.ReactNode;
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

        {corretor}

        <div id={idFormulario} className="space-y-3 border-t pt-4 scroll-mt-24">
          <h2 className={TITULO_BLOCO}>Receba mais informações</h2>
          <FormularioContato
            imovelId={imovelId}
            mensagemPreenchida={mensagemFormulario}
            idPrefixo="aside-"
            orgSlug={orgSlug}
            basePath={basePath}
          />
        </div>
      </CardContent>
    </Card>
  );
}

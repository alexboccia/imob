import Link from "next/link";
import { IconeCheck, IconeWhatsApp } from "@/components/icons";
// buttonVariants (não o componente Button): o Button do projeto é o
// primitivo do Base UI, que marca role="button" mesmo quando renderiza um
// <a> — um leitor de tela anunciaria "botão" para um link que navega de
// página. Aqui são navegações de verdade (/anuncie e wa.me), então o
// elemento é um link real com a APARÊNCIA de botão.
import { buttonVariants } from "@/components/ui/button";
import { TITULO_SECAO } from "@/lib/site-typography";
import { linkWhatsApp } from "@/lib/whatsapp";

// Captação de proprietário — o lado do negócio que a Home não tinha:
// antes ela só falava com quem PROCURA imóvel, nunca com quem TEM um pra
// vender ou alugar.
//
// Todo o CTA aponta pra /anuncie, que já é uma rota pública real com
// formulário funcionando (AnuncieForm → ação de captação), não uma tela
// inventada pra fechar o layout.
//
// Os benefícios listados descrevem o que este sistema realmente faz:
// anúncio no site do próprio tenant com fotos/planta/localização
// (Property.media, latitude/longitude), avaliação por um corretor antes
// de publicar (exatamente o texto que /anuncie já promete) e os contatos
// caindo no painel da equipe (o formulário público gera registro no CRM).
// Nada sobre "principais portais" ou distribuição externa — o produto não
// faz isso.
const BENEFICIOS = [
  "Anúncio com fotos, planta e localização no site da imobiliária",
  "Um corretor avalia o imóvel e prepara a publicação",
  "Os contatos de interessados chegam direto para a equipe",
];

export function SecaoCaptacao({
  basePath,
  nome,
  whatsapp,
}: {
  basePath: string;
  nome: string;
  whatsapp?: string | null;
}) {
  // CTA de WhatsApp só existe quando o tenant configurou um número real
  // (Configurações → Contato). Sem número, a seção continua completa com
  // o CTA principal — degrada, não quebra.
  const hrefWhatsApp = linkWhatsApp(
    whatsapp,
    `Olá! Tenho um imóvel para anunciar com a ${nome}.`
  );

  return (
    <section className="bg-secondary/40 border-y">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-14 lg:flex-row lg:items-center lg:gap-16">
        <div className="min-w-0 lg:flex-1">
          <h2 className={TITULO_SECAO}>Vai vender ou alugar?</h2>
          <p className="mt-3 max-w-prose text-base text-gray-600">
            Anuncie seu imóvel com quem entende do mercado. Conte como ele é e
            um corretor entra em contato para avaliar e preparar o anúncio.
          </p>

          <ul className="mt-6 space-y-3">
            {BENEFICIOS.map((beneficio) => (
              <li key={beneficio} className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <IconeCheck className="size-4" />
                </span>
                <span className="min-w-0 text-sm text-gray-700">{beneficio}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA num cartão próprio em vez de solto na coluna: sobre o fundo
            tonalizado da seção, um botão sozinho no meio do espaço vazio
            perde ancoragem visual em telas largas. O cartão usa
            bg-background/border do tema, não cor fixa. */}
        <div className="w-full shrink-0 rounded-2xl border bg-background p-5 shadow-sm lg:w-80">
          {/* Descreve o formulário real de /anuncie (nome, e-mail,
              telefone e uma descrição do imóvel) em vez de prometer prazo
              de retorno ou tempo de preenchimento — nada disso é
              garantido pelo sistema. */}
          <p className="text-sm text-gray-600">
            Formulário curto: seus dados de contato e uma descrição do
            imóvel.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link
              href={`${basePath}/anuncie`}
              className={buttonVariants({
                size: "lg",
                className: "w-full sm:flex-1 lg:flex-none",
              })}
            >
              Anuncie seu imóvel
            </Link>
            {hrefWhatsApp && (
              <a
                href={hrefWhatsApp}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({
                  size: "lg",
                  variant: "outline",
                  className: "w-full sm:flex-1 lg:flex-none",
                })}
              >
                <IconeWhatsApp className="size-5 text-whatsapp-brand" />
                Falar no WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

import Image from "next/image";
import { FormularioContato } from "@/components/FormularioContato";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IconePessoa, IconeWhatsApp } from "@/components/icons";
import { RastreioCliqueWhatsApp } from "@/components/analytics/RastreioCliqueWhatsApp";
import { formatarPreco } from "@/lib/format";
import type { CorretorPublico } from "@/lib/perfil-publico-corretor";

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

// Apresentação compacta: foto, nome, CRECI e o papel. A apresentação
// (bio) entra em texto pequeno e limitado a três linhas — o imóvel
// continua sendo o produto da página, e uma bio longa aqui empurraria o
// formulário pra fora da tela.
function IdentidadeCorretor({ corretor }: { corretor: CorretorPublico }) {
  return (
    <div className="border-t pt-4">
      <div className="flex items-center gap-3">
        <span className="relative size-11 shrink-0 overflow-hidden rounded-full border bg-secondary">
          {corretor.foto ? (
            <Image
              src={corretor.foto}
              alt={`Foto de ${corretor.nome}`}
              fill
              sizes="44px"
              className="object-cover"
            />
          ) : (
            // Placeholder neutro, nunca as iniciais do usuário interno:
            // sem foto pública enviada, não há foto pra mostrar.
            <span
              aria-hidden
              className="flex size-full items-center justify-center text-primary"
            >
              <IconePessoa className="size-5" />
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-gray-900">
            {corretor.nome}
          </span>
          <span className="block text-xs text-gray-500">
            {corretor.creci ? `${corretor.creci} · ` : ""}Corretor(a)
            responsável
          </span>
        </span>
      </div>
      {corretor.bio && (
        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-gray-600">
          {corretor.bio}
        </p>
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
  corretor,
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
  // null = nenhum profissional autorizado a aparecer (ver
  // resolverCorretorPublico). O card degrada pra identidade
  // institucional simplesmente omitindo o bloco.
  corretor: CorretorPublico | null;
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

        {/* Identidade comercial do profissional — só quando resolverCorretorPublico
            devolveu alguém, ou seja, só com opt-in explícito. Sem perfil
            publicado este bloco inteiro não existe e o card mostra apenas
            preço, CTA e formulário, que já são a identidade da própria
            imobiliária (logo e nome estão no cabeçalho e no rodapé do
            site). Antes daqui, o nome do usuário administrativo era
            publicado automaticamente por ser responsável pelo imóvel. */}
        {corretor && <IdentidadeCorretor corretor={corretor} />}

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

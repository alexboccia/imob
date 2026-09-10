import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IconePessoa, IconeWhatsApp } from "@/components/icons";
import { RastreioCliqueWhatsApp } from "@/components/analytics/RastreioCliqueWhatsApp";
import { TITULO_BLOCO } from "@/lib/site-typography";
import type { CorretorPublico } from "@/lib/perfil-publico-corretor";

// Card do corretor responsável, na coluna de conteúdo da ficha.
//
// Só existe quando resolverCorretorPublico devolveu alguém — ou seja, só
// com opt-in explícito do profissional. Papel (OWNER/ADMIN), ser
// responsável pelo imóvel, ter foto ou WhatsApp cadastrado: nada disso
// publica ninguém. Sem perfil publicado, a ficha inteira segue como a
// identidade institucional que ela já era.
//
// POR QUE AQUI, E NÃO NO CARD LATERAL: esta identidade morava dentro do
// card de conversão, espremida entre o CTA de WhatsApp e o formulário —
// os dois elementos que fazem o visitante agir. Numa coluna larga ela
// respira, a bio deixa de precisar de line-clamp, e o card lateral
// recupera a hierarquia que ele tinha sido desenhado para ter (preço,
// CTA, formulário). A identidade não foi duplicada: ela mudou de lugar.
//
// O QUE NÃO ESTÁ AQUI, E POR QUÊ:
//
//   - Logotipo da imobiliária. O cabeçalho do site é `sticky top-0`, ou
//     seja, a marca está permanentemente na tela enquanto se rola a
//     ficha. Repeti-la dentro do card não acrescentaria informação — e
//     custaria uma consulta a mais nesta página.
//   - "Ver perfil completo". Não existe página pública de perfil de
//     corretor neste produto (as rotas públicas são home, listagem,
//     detalhe, contato, anuncie e vendidos). Um botão sem destino é pior
//     que botão nenhum, então ele não é renderizado.
//   - Telefone e e-mail do profissional. O domínio não tem campo público
//     para nenhum dos dois: `OrganizationMember.whatsapp` e
//     `contactEmail` são operacionais — cadastrados para a equipe usar
//     internamente — e publicar um deles seria transformar dado interno
//     em consentimento que ninguém deu.

export function CardCorretorImovel({
  corretor,
  whatsappHref,
  imovelId,
  orgSlug,
}: {
  corretor: CorretorPublico;
  /** Número PESSOAL do corretor, já publicado por ele. null = sem botão. */
  whatsappHref: string | null;
  imovelId: string;
  orgSlug: string;
}) {
  return (
    <Card data-card-corretor>
      <CardContent>
        <h2 className={`${TITULO_BLOCO} mb-4`}>Corretor(a) responsável</h2>

        {/* items-start e min-w-0: nome longo quebra em vez de empurrar a
            foto ou estourar a largura no mobile estreito. */}
        <div className="flex items-start gap-4">
          <span className="relative size-16 shrink-0 overflow-hidden rounded-full border bg-secondary">
            {corretor.foto ? (
              <Image
                src={corretor.foto}
                alt={`Foto de ${corretor.nome}`}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              // Placeholder neutro, nunca as iniciais do usuário interno:
              // sem foto pública enviada, não há foto para mostrar.
              <span
                aria-hidden
                className="flex size-full items-center justify-center text-primary"
              >
                <IconePessoa className="size-7" />
              </span>
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-gray-900">{corretor.nome}</p>
            {/* O CRECI é o registro profissional: quando existe, é ele que
                sustenta a confiança que este card inteiro existe para
                gerar. Sem ele, a linha some — nada de rótulo vazio. */}
            {corretor.creci && (
              <p className="mt-0.5 text-sm text-gray-500">{corretor.creci}</p>
            )}
          </div>
        </div>

        {corretor.bio && (
          <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed whitespace-pre-line text-gray-700">
            {corretor.bio}
          </p>
        )}

        {whatsappHref && (
          <div className="mt-5">
            <RastreioCliqueWhatsApp
              orgSlug={orgSlug}
              imovelId={imovelId}
              placement="BROKER_CARD"
            >
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                // O texto acompanha o ícone: quem usa leitor de tela, e
                // quem simplesmente não reconhece o glifo, recebe a mesma
                // informação. O aria-label nomeia a pessoa, porque a
                // página tem outros CTAs de WhatsApp e "Falar no WhatsApp"
                // sozinho não distinguiria este.
                aria-label={`Falar no WhatsApp com ${corretor.nome}`}
                // size "lg" é o maior da escala deste design system (36px,
                // a mesma altura do CTA principal do card lateral) — e no
                // mobile a largura total dá o alvo de toque confortável.
                // Inventar um botão mais alto só aqui deixaria o card com
                // cara de peça estrangeira.
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "w-full sm:w-auto",
                })}
              >
                <IconeWhatsApp className="size-5" aria-hidden />
                Falar no WhatsApp
              </a>
            </RastreioCliqueWhatsApp>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

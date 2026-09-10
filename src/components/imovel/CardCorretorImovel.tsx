import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  IconeEmail,
  IconePessoa,
  IconeTelefone,
  IconeWhatsApp,
} from "@/components/icons";
import { RastreioCliqueWhatsApp } from "@/components/analytics/RastreioCliqueWhatsApp";
import { TITULO_BLOCO } from "@/lib/site-typography";
import {
  caminhoPerfilCorretor,
  hrefEmail,
  hrefTelefone,
  type ContatosPublicosCorretor,
  type CorretorPublico,
} from "@/lib/perfil-publico-corretor";
import { formatarTelefone } from "@/lib/telefone";

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
//
// CONTATOS: só os que o profissional publicou, cada um no seu campo
// próprio (publicPhone/publicEmail/publicWhatsapp). Nenhum deles cai no
// contato institucional — um botão ao lado de um rosto precisa falar com
// aquela pessoa. Sem nada publicado, o card continua válido: identidade
// e link do perfil, sem botão de contato nenhum.

export function CardCorretorImovel({
  corretor,
  membroId,
  basePath,
  contatos,
  whatsappHref,
  imovelId,
  orgSlug,
}: {
  corretor: CorretorPublico;
  /** Id do membro — o destino do perfil público, montado pelo helper central. */
  membroId: string;
  basePath: string;
  /** Contatos publicados por ele. Cada null apaga o botão correspondente. */
  contatos: ContatosPublicosCorretor;
  /** Link de WhatsApp já montado com a mensagem do imóvel. null = sem botão. */
  whatsappHref: string | null;
  imovelId: string;
  orgSlug: string;
}) {
  const telefoneHref = hrefTelefone(contatos.telefone);
  const emailHref = hrefEmail(contatos.email);
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

        {/* O perfil público existe exatamente quando este card existe:
            os dois exigem publicProfileEnabled, e a rota devolve 404 sem
            ele. Por isso o CTA não precisa de condição própria — e não
            há como ele apontar para uma página inexistente. O caminho sai
            do helper central; nenhum componente concatena rota à mão. */}
        {/* Até quatro ações: empilham no mobile e quebram em linha a
            partir de sm, em vez de virarem quatro botões ilegíveis lado a
            lado numa tela estreita. */}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href={caminhoPerfilCorretor(basePath, membroId)}
            className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}
          >
            Ver perfil completo
          </Link>

          {telefoneHref && (
            <a
              href={telefoneHref}
              aria-label={`Ligar para ${corretor.nome}`}
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "w-full sm:w-auto",
              })}
            >
              <IconeTelefone className="size-5" aria-hidden />
              {formatarTelefone(contatos.telefone!)}
            </a>
          )}

          {whatsappHref && (
            <>
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
            </>
          )}

          {emailHref && (
            <a
              href={emailHref}
              aria-label={`Enviar e-mail para ${corretor.nome}`}
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "w-full sm:w-auto",
              })}
            >
              <IconeEmail className="size-5" aria-hidden />
              E-mail
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

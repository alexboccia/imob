import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

// Corretor responsável — dentro do card lateral de conversão (Fase 51),
// entre os CTAs e o formulário.
//
// Só existe quando resolverCorretorPublico devolveu alguém — ou seja, só
// com opt-in explícito do profissional. Papel (OWNER/ADMIN), ser
// responsável pelo imóvel, ter foto ou WhatsApp cadastrado: nada disso
// publica ninguém. Sem perfil publicado, a ficha inteira segue como a
// identidade institucional que ela já era.
//
// POR QUE AQUI: a lateral responde, de cima para baixo, "quanto custa",
// "quem atende" e "como falar" — e quem atende vem logo antes do
// formulário, para o visitante saber com quem está falando ao preencher.
// Na Fase 43 esta identidade tinha ido para a coluna de conteúdo, onde
// ficava longe do formulário; agora volta, e a coluna de conteúdo não a
// repete: ela mudou de lugar de novo, não foi duplicada.
//
// Seção, não Card: já está DENTRO do card lateral, e um card aninhado
// não acrescentaria nada além de moldura.
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
    <section data-card-corretor className="space-y-4 border-t pt-4">
      <h2 className={TITULO_BLOCO}>Corretor(a) responsável</h2>

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
        <p className="max-w-prose text-[0.9375rem] leading-relaxed whitespace-pre-line text-gray-700">
          {corretor.bio}
        </p>
      )}

      {/* O perfil público existe exatamente quando este card existe:
          os dois exigem publicProfileEnabled, e a rota devolve 404 sem
          ele. Por isso o CTA não precisa de condição própria — e não
          há como ele apontar para uma página inexistente. O caminho sai
          do helper central; nenhum componente concatena rota à mão. */}
      {/* Fase 53 — UMA linha: o perfil ocupa o espaço que sobra e os
          contatos são botões quadrados só com ícone. Antes cada ação
          era `w-full` e a toolbar virava quatro faixas empilhadas (e o
          telefone exibia o número, que o href já carrega). O número, o
          endereço e o link do WhatsApp continuam iguais — mudou a
          apresentação, não o dado nem a regra de quem pode aparecer.
          Em telas muito estreitas o grupo de contatos desce inteiro
          para a linha de baixo, sem voltar a ser texto. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={caminhoPerfilCorretor(basePath, membroId)}
          data-acao-corretor="perfil"
          // cn() e não a className do buttonVariants: só a mescla do
          // tailwind-merge tira o `border-transparent` da base, que de
          // outro modo vence a cor do tenant.
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            // Contorno na cor do tenant (nada de azul fixo): as mesmas
            // classes de item ativo do menu do site.
            //
            // min-w-fit: o rótulo nunca é cortado nem quebrado. Quando
            // a coluna não comporta os quatro (a lateral tem ~277px em
            // 1024, e a fonte varia entre máquinas), quem desce para a
            // linha de baixo é o GRUPO de contatos inteiro — os quatro
            // continuam com a mesma altura e os contatos, quadrados.
            "min-w-fit flex-1 border-primary text-primary hover:bg-primary/5 hover:text-primary"
          )}
        >
          Ver perfil completo
        </Link>

        {/* Só existe quando há contato publicado: um contêiner vazio
            deixaria um vão à direita do perfil. */}
        {(telefoneHref || whatsappHref || emailHref) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {telefoneHref && (
            <a
              href={telefoneHref}
              data-acao-corretor="telefone"
              aria-label={`Ligar para ${corretor.nome}`}
              title={`Ligar para ${corretor.nome}`}
              className={buttonVariants({ variant: "outline", size: "icon-lg" })}
            >
              <IconeTelefone className="size-5" aria-hidden="true" />
            </a>
          )}

          {whatsappHref && (
            <RastreioCliqueWhatsApp orgSlug={orgSlug} imovelId={imovelId} placement="BROKER_CARD">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                data-acao-corretor="whatsapp"
                // O nome acessível nomeia a PESSOA: a ficha tem outro CTA
                // de WhatsApp (o da imobiliária, no topo do card).
                aria-label={`Falar no WhatsApp com ${corretor.nome}`}
                title={`Falar no WhatsApp com ${corretor.nome}`}
                className={buttonVariants({
                  variant: "outline",
                  size: "icon-lg",
                  // Verde do canal só no ícone — o botão continua sendo
                  // um contato discreto, não um CTA comercial.
                  className: "text-whatsapp-brand hover:text-whatsapp-brand",
                })}
              >
                <IconeWhatsApp className="size-5" aria-hidden="true" />
              </a>
            </RastreioCliqueWhatsApp>
          )}

          {emailHref && (
            <a
              href={emailHref}
              data-acao-corretor="email"
              aria-label={`Enviar e-mail para ${corretor.nome}`}
              title={`Enviar e-mail para ${corretor.nome}`}
              className={buttonVariants({ variant: "outline", size: "icon-lg" })}
            >
              <IconeEmail className="size-5" aria-hidden="true" />
            </a>
          )}
        </div>
        )}
      </div>
    </section>
  );
}

import Image from "next/image";
import { TITULO_HERO, SUBTITULO_HERO } from "@/lib/site-typography";

// Proposta 2 (correção) — antes o painel de busca vivia FORA/abaixo deste
// componente (barra horizontal com -mt negativo simulando sobreposição).
// Agora ele entra como `children` e faz parte da MESMA composição:
// headline à esquerda + card vertical à direita em desktop (lg:flex-row),
// headline em cima + card abaixo em mobile (flex-col, cheio dentro do
// hero, não "flutuando" por cima da seção seguinte). Altura do hero
// deixou de ser fixa (era h-[420..600px]) — agora é o padding + o
// conteúdo (headline + card) que decidem a altura, senão o card vertical
// (mais alto que a barra horizontal de antes) ficaria cortado ou sobraria
// espaço vazio dependendo do breakpoint.
export function HeroHome({
  imagemUrl,
  children,
}: {
  imagemUrl: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="relative bg-gray-900">
      <div className="absolute inset-0 overflow-hidden">
        {imagemUrl ? (
          // object-cover sozinho, no formato de hero atual (bem mais largo
          // que alto), já preenche 100% da largura sem sobrar corte
          // horizontal — só corta em cima/embaixo. Isso trava o
          // enquadramento horizontal em "centro", que em desktop cai bem
          // onde o card de busca fica (lado direito) e pode cobrir rostos
          // em fotos de família (padrão comum de foto de estoque
          // "lifestyle"). lg:scale-110 dá folga de corte extra nos dois
          // eixos sem depender do aspect-ratio da imagem, e
          // lg:object-[30%_38%] usa essa folga pra puxar o foco pra
          // cima/esquerda — mantém o sujeito principal visível e afastado
          // do card, sem esconder nada no mobile (empilhado, sem esse
          // conflito) nem exigir configuração de focal point por imagem.
          // É um padrão de enquadramento razoável pra QUALQUER foto nesse
          // layout (headline+card), não um ajuste específico pra esta.
          <Image
            src={imagemUrl}
            alt=""
            fill
            priority
            className="object-cover lg:scale-110 lg:object-[30%_38%]"
            sizes="100vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-900 to-black" />
        )}
        {/* Overlay mais forte à esquerda em desktop (onde fica o texto)
            que à direita (onde fica o card branco, que já garante seu
            próprio contraste) — mesmo racional de sempre: overlay neutro
            (nunca a cor do tema), pra legibilidade funcionar em qualquer
            organização/tema. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20 lg:bg-gradient-to-r lg:from-black/80 lg:via-black/55 lg:to-black/25" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20 lg:py-24">
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <div className="max-w-xl text-center lg:flex-1 lg:text-left">
            <h1 className={TITULO_HERO}>Encontre o imóvel ideal para você</h1>
            <p className={`${SUBTITULO_HERO} mt-4`}>
              Apartamentos, casas e imóveis comerciais selecionados para você.
            </p>
          </div>

          <div className="w-full max-w-md lg:w-[380px] lg:shrink-0">{children}</div>
        </div>
      </div>
    </section>
  );
}

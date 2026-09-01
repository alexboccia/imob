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
          // que alto), já preenche 100% da LARGURA sem sobrar corte
          // horizontal nativo — só corta em cima/embaixo (object-position
          // aí tem efeito real, ver Y abaixo). Isso trava o enquadramento
          // horizontal em "centro" independente de object-position (não há
          // sobra pra ele redistribuir), que em desktop cai bem onde o
          // card de busca fica (lado direito) e pode cobrir rostos em
          // fotos de família (composição comum: sujeitos espalhados por
          // boa parte da largura do quadro).
          //
          // lg:scale-[1.15] com transform-origin (lg:origin-[100%_55%]) —
          // NÃO object-position — cria a folga de corte horizontal real:
          // scale amplia a imagem já enquadrada em torno do ponto definido
          // por origin, então origin-x=100% ancora a borda DIREITA (onde
          // fica o card) e o corte extra do zoom cai inteiro do lado
          // ESQUERDO, empurrando o sujeito mais à direita do quadro pra
          // longe do card sem esticar/distorcer a imagem (scale é
          // uniforme nos dois eixos). object-position (linha de baixo)
          // não tem efeito nenhum aqui nesse eixo — é puramente cosmético,
          // mantido só por padronização com o Y.
          //
          // Y=55% em object-position AQUI tem efeito real (há corte
          // vertical nativo do cover-fit): a maioria das fotos "família na
          // sala" tem gente na metade inferior do quadro (sentados/no
          // chão) e teto/janela/parede na metade superior, então cortar um
          // pouco mais de CIMA que de BAIXO mantém rostos no quadro. origin-y
          // usa o mesmo valor (55%) pra o corte do scale não brigar com o
          // do object-position.
          //
          // 1.15 é a MENOR escala que ainda protege o sujeito mais à
          // direita do quadro contra o card em qualquer largura ≥1024px —
          // testado exaustivamente (1024 a 2338px) contra duas fotos reais
          // com composições bem diferentes; escalas maiores cortavam quem
          // ficava mais à esquerda em telas mais estreitas (o card ocupa
          // proporcionalmente MAIS da largura quanto mais estreita a tela,
          // não menos). Sem efeito no mobile (empilhado, sem esse
          // conflito) nem exigência de focal point configurável por
          // imagem — é uma estratégia de enquadramento genérica pro layout
          // headline+card, não um ajuste específico pra uma foto.
          <Image
            src={imagemUrl}
            alt=""
            fill
            priority
            className="object-cover lg:scale-[1.15] lg:origin-[100%_55%] lg:object-[center_55%]"
            sizes="100vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-900 to-black" />
        )}
        {/* Overlay mais forte à esquerda em desktop (onde fica o texto)
            que à direita (onde fica o card branco, que já garante seu
            próprio contraste) — mesmo racional de sempre: overlay neutro
            (nunca a cor do tema), pra legibilidade funcionar em qualquer
            organização/tema. Bem mais leve que antes — só o suficiente
            pra segurar contraste do título sobre céu/janela claros, sem
            lavar a cor real da foto. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/20 to-transparent lg:bg-gradient-to-r lg:from-black/45 lg:via-black/20 lg:to-transparent" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20 lg:py-12">
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

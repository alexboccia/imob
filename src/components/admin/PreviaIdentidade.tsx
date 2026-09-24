"use client";

import { useEffect, useState } from "react";
import {
  CATALOGO_TEMAS,
  TEMA_PADRAO_ID,
  THEME_ID_CUSTOMIZADO,
  type Tema,
  type TokensTema,
} from "@/lib/branding/temas";
import { assinarPaleta } from "@/lib/branding/canal-previa-tema";
import { HERO_TITULO, HERO_SUBTITULO, SECAO_DESTAQUES_TITULO } from "@/lib/site-typography";
import type { ImovelPrevia } from "@/lib/previa-identidade-data";

// =======================================================================
// Prévia do site público (Fase 62)
// =======================================================================
// A versão da Fase 61 era uma maquete ABSTRATA: barras cinza no lugar dos
// textos, três retângulos no lugar dos cards, um hero sem imagem. A causa
// foi a ordem em que as coisas foram feitas — o objetivo daquela fase era
// provar que a troca de tema aparecia ANTES de salvar, então bastava
// pintar blocos com os tokens; os dados reais (logotipo, imagem do hero,
// imóveis publicados) nunca foram levados até o componente.
//
// Agora a prévia mostra o site da organização: o logotipo configurado, a
// imagem do hero configurada, a mesma chamada do hero real, e os imóveis
// que estão publicados de verdade, com foto, título, bairro e preço.
//
// COMO REUTILIZA O SITE, sem iframe e sem duplicar regra de negócio:
//   - as cores entram como CSS VARS no wrapper (--primary, --secondary,
//     --border...), exatamente a técnica do layout público em
//     src/app/[orgSlug]/layout.tsx. Abaixo do wrapper as classes são as
//     utilitárias de sempre (bg-primary, text-primary-foreground,
//     border-border), então o preview e o site leem o MESMO token;
//   - o texto do hero e o título da vitrine vêm de @/lib/site-typography,
//     as mesmas constantes que HeroHome e a Home importam;
//   - os imóveis vêm de buscarImoveisPrevia, que usa o filtro de
//     elegibilidade pública, o select e o DTO do card público.
//
// Por que não reaproveitar HeroHome/ImovelCard diretamente: HeroHome é uma
// seção full-bleed que exige o painel de busca como children e usa
// next/image com `fill` + priority; ImovelCard carrega Swiper, Links de
// navegação e o botão de favoritos. Dentro de um cartão de 320px os dois
// trariam peso e comportamento (navegar para fora, favoritar) que uma
// prévia não deve ter. A composição abaixo é reduzida, mas fiel — e os
// dados e tokens que ela mostra são os reais.
//
// Nada aqui é específico de nenhuma organização: logotipo, nome, imagem e
// imóveis chegam por props, resolvidos no servidor para o tenant da sessão.
//
// Fase 63 — a coluna da prévia ganhou largura (38% da grade) e o
// enquadramento INTERNO cresceu junto: hero 112px -> 144px, foto do card
// 40px -> 56px, e a tipografia saiu dos 7-11px para 9-14px. Sem isso a
// miniatura continuaria pequena dentro de um card maior, que era o defeito
// apontado: o CTA, o preço e o título dos imóveis ficavam ilegíveis.

export function PreviaIdentidade({
  temaInicial,
  temaCustomizado,
  logo,
  nomeFallback,
  heroImagem,
  imoveis,
}: {
  temaInicial: string | null;
  temaCustomizado: Tema | null;
  logo: string | null;
  /** Nome exibido quando não há logotipo — o da organização, nunca fixo. */
  nomeFallback: string;
  /** Imagem do hero já resolvida no servidor (a configurada ou o padrão). */
  heroImagem: string | null;
  /** Imóveis publicados da organização — vazio é um estado legítimo. */
  imoveis: ImovelPrevia[];
}) {
  const [themeId, setThemeId] = useState(temaInicial ?? TEMA_PADRAO_ID);
  const [nome, setNome] = useState(nomeFallback);
  // Paleta editada no card ao lado, ainda não salva. `null` = nada foi
  // mexido nesta sessão, então vale o tema resolvido pelo themeId.
  const [paletaAoVivo, setPaletaAoVivo] = useState<TokensTema | null>(null);

  useEffect(() => {
    function sincronizar(evento: Event) {
      const alvo = evento.target as HTMLInputElement | null;
      if (!alvo?.name) return;
      if (alvo.name === "themeId" && alvo.checked) setThemeId(alvo.value);
      if (alvo.name === "nomePublico") setNome(alvo.value.trim() || nomeFallback);
    }
    document.addEventListener("change", sincronizar);
    // `input` para o nome acompanhar a digitação, não só o blur.
    document.addEventListener("input", sincronizar);
    return () => {
      document.removeEventListener("change", sincronizar);
      document.removeEventListener("input", sincronizar);
    };
  }, [nomeFallback]);

  // Canal do editor de cores: cobre o que NÃO gera evento de DOM — gerar
  // a paleta pelo logotipo, o conta-gotas e o "restaurar padrão".
  useEffect(() => assinarPaleta(setPaletaAoVivo), []);

  const temaSalvo =
    themeId === THEME_ID_CUSTOMIZADO && temaCustomizado
      ? temaCustomizado
      : (CATALOGO_TEMAS[themeId] ?? CATALOGO_TEMAS[TEMA_PADRAO_ID]);

  // A paleta editada ganha do tema salvo — é o que faz "alterei aqui, vejo
  // ali" valer antes de qualquer gravação.
  const tokens: TokensTema = paletaAoVivo ?? temaSalvo;

  return (
    <div className="min-w-0" data-previa-identidade>
      <p className="text-sm font-medium">Pré-visualização do site</p>
      {/* Fase 64 — a frase terminava com "Ainda não salvo.", que aparecia
          sempre, inclusive ao abrir a tela sem ter mexido em nada: sugeria
          uma pendência inexistente. Como o formulário é não-controlado e
          não há dirty-state confiável, a correção é remover a afirmação —
          não inventar o estado só para sustentá-la. */}
      <p className="mb-3 text-sm text-muted-foreground">
        Como o seu site público fica com as escolhas desta aba.
      </p>

      {/* As CSS vars do tema escopadas neste wrapper — mesma técnica do
          layout público. É o que permite usar bg-primary/border-border
          abaixo em vez de repetir style={{...}} em cada elemento, e o que
          garante que o preview não vaza o tema para o resto do painel. */}
      <div
        // `aria-hidden`: é ilustração do que os controles ao lado já dizem
        // em texto. Anunciá-la faria o leitor de tela percorrer uma maquete
        // duplicando informação.
        aria-hidden="true"
        data-previa-tema={paletaAoVivo ? THEME_ID_CUSTOMIZADO : temaSalvo.id}
        className="overflow-hidden rounded-xl border bg-white shadow-sm"
        style={
          {
            "--primary": tokens.primary,
            "--primary-foreground": tokens.onPrimary,
            "--primary-hover": tokens.primaryHover,
            "--primary-light": tokens.primaryLight,
            "--secondary": tokens.secondary,
            "--border": tokens.border,
            "--link": tokens.link,
          } as React.CSSProperties
        }
      >
        {/* ---------------- Cabeçalho ---------------- */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            {logo ? (
              // Logotipo REAL da organização. <img> em vez de next/image:
              // a URL vem do R2 do tenant e a miniatura tem altura fixa —
              // não há ganho de otimização e evita configurar domínio.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-6 w-auto max-w-28 object-contain" />
            ) : (
              <span className="min-w-0 truncate text-sm font-bold">{nome}</span>
            )}
          </span>
          {/* Mesma navegação do SiteHeader público. */}
          <span className="flex shrink-0 items-center gap-2 text-[10px] text-gray-600">
            <span>Comprar</span>
            <span>Alugar</span>
            <span>Lançamentos</span>
            <span className="rounded bg-primary-light px-1.5 py-0.5 text-primary">Favoritos</span>
          </span>
        </div>

        {/* ---------------- Hero ---------------- */}
        <div className="relative">
          {heroImagem ? (
            // Imagem REAL do hero (a configurada, ou o asset padrão que a
            // Home usa quando a organização nunca customizou).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroImagem} alt="" className="h-36 w-full object-cover" />
          ) : (
            <div className="h-36 w-full bg-gradient-to-br from-gray-800 via-gray-900 to-black" />
          )}
          {/* Mesmo overlay neutro do HeroHome — nunca a cor do tema, para
              o contraste do título funcionar em qualquer organização. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end gap-1 p-3.5">
            {/* Texto REAL do hero, da mesma constante que o site usa. */}
            <p className="text-sm leading-tight font-bold text-white">{HERO_TITULO}</p>
            <p className="line-clamp-1 text-[10px] text-white/90">{HERO_SUBTITULO}</p>
            {/* CTA com hover REAL: é o que deixa o administrador ver a
                cor de "Primária no hover" — um token que só existe no
                estado :hover e, portanto, não daria para demonstrar num
                elemento estático. <button type="button"> porque um <span>
                não responde a hover de forma acessível; ele não faz nada
                (a maquete inteira é aria-hidden e o botão é inerte). */}
            <button
              type="button"
              tabIndex={-1}
              data-previa-cta
              className="mt-1 inline-block w-fit cursor-default rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Buscar imóveis
            </button>
          </div>
        </div>

        {/* ---------------- Destaques ---------------- */}
        <div className="bg-secondary/40 px-3.5 py-3">
          <p className="mb-2.5 text-xs font-bold text-gray-900">{SECAO_DESTAQUES_TITULO}</p>

          {imoveis.length === 0 ? (
            // Estado vazio honesto: sem imóvel publicado a prévia diz isso,
            // em vez de inventar cartões que não existem no site.
            <p className="text-[11px] text-gray-500">
              Seus imóveis publicados aparecem aqui.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {imoveis.map((imovel) => (
                <div
                  key={imovel.id}
                  className="overflow-hidden rounded-md border border-border bg-white"
                >
                  {imovel.foto ? (
                    // Foto de capa REAL do imóvel.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imovel.foto} alt="" className="h-14 w-full object-cover" />
                  ) : (
                    <div className="h-14 w-full bg-primary-light" />
                  )}
                  <div className="space-y-0.5 p-1.5">
                    <p className="line-clamp-2 text-[10px] leading-tight font-semibold text-gray-900">
                      {imovel.titulo}
                    </p>
                    <p className="line-clamp-1 text-[9px] text-gray-500">{imovel.local}</p>
                    {/* Preço REAL, com a formatação do card público. */}
                    {/* Superfície clara derivada da identidade — o mesmo
                        papel que --primary-light cumpre no site público
                        (chips e ícones circulares). */}
                    <p
                      data-previa-superficie-clara
                      className="w-fit rounded bg-primary-light px-1 py-0.5 text-[10px] font-bold text-primary"
                    >
                      {imovel.preco}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---------------- Rodapé ---------------- */}
        <div className="flex items-center justify-between gap-2 bg-primary px-3.5 py-2.5">
          <span className="min-w-0 truncate text-[10px] font-medium text-primary-foreground">
            {nome}
          </span>
          <span className="shrink-0 text-[9px] text-primary-foreground/70">
            Contato · Imóveis
          </span>
        </div>
      </div>
    </div>
  );
}

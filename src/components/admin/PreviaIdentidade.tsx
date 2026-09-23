"use client";

import { useEffect, useState } from "react";
import { CATALOGO_TEMAS, TEMA_PADRAO_ID, THEME_ID_CUSTOMIZADO, type Tema } from "@/lib/branding/temas";

// =======================================================================
// Prévia da identidade visual (Fase 61)
// =======================================================================
// "Alterei aqui, vejo ali": uma maquete reduzida do site que reage à
// escolha do tema ANTES de salvar.
//
// LÊ O FORMULÁRIO, não um estado paralelo. O seletor de temas é um
// componente de servidor com radios nativos (`name="themeId"`), e o
// gerador de paleta mantém a sua própria prévia — duplicar esse estado
// aqui criaria duas fontes para a mesma escolha. Em vez disso, este
// componente escuta `change` no formulário e lê qual radio está
// marcado. Nenhum componente existente precisou ser refatorado.
//
// Não é um iframe do site real: seria pesado, dependeria de uma rota
// pública renderizando com valores ainda não salvos, e quebraria com
// facilidade. É uma representação — cabeçalho, botão, cartão — com as
// cores que de fato serão aplicadas.

export function PreviaIdentidade({
  temaInicial,
  temaCustomizado,
  logo,
  nomeFallback,
}: {
  temaInicial: string | null;
  temaCustomizado: Tema | null;
  logo: string | null;
  /** Nome exibido quando não há logotipo — o da organização, nunca fixo. */
  nomeFallback: string;
}) {
  const [themeId, setThemeId] = useState(temaInicial ?? TEMA_PADRAO_ID);
  const [nome, setNome] = useState(nomeFallback);

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

  const tema =
    themeId === THEME_ID_CUSTOMIZADO && temaCustomizado
      ? temaCustomizado
      : (CATALOGO_TEMAS[themeId] ?? CATALOGO_TEMAS[TEMA_PADRAO_ID]);

  return (
    <div className="min-w-0" data-previa-identidade>
      <p className="text-sm font-medium">Prévia do site</p>
      <p className="mb-3 text-sm text-muted-foreground">
        Uma amostra de como as cores escolhidas aparecem no site público.
      </p>

      {/* `aria-hidden`: é ilustração do que os controles ao lado já
          dizem em texto. Anunciá-la faria o leitor de tela percorrer uma
          maquete sem conteúdo real. */}
      <div
        aria-hidden="true"
        data-previa-tema={tema.id}
        className="overflow-hidden rounded-xl border shadow-sm"
        style={{ backgroundColor: "#fff" }}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
          <span className="flex min-w-0 items-center gap-2">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-5 w-auto max-w-24 object-contain" />
            ) : (
              <span className="truncate text-xs font-bold">{nome}</span>
            )}
          </span>
          <span className="flex shrink-0 gap-1.5">
            {["Comprar", "Alugar"].map((item) => (
              <span key={item} className="text-[10px] text-gray-500">
                {item}
              </span>
            ))}
            <span
              className="rounded px-1.5 text-[10px]"
              style={{ backgroundColor: tema.primaryLight, color: tema.primary }}
            >
              Favoritos
            </span>
          </span>
        </div>

        {/* Hero */}
        <div className="px-3 py-4" style={{ backgroundColor: tema.secondary }}>
          <div className="h-2 w-2/3 rounded" style={{ backgroundColor: tema.primary }} />
          <div className="mt-1.5 h-1.5 w-1/2 rounded bg-gray-300" />
          <span
            className="mt-3 inline-block rounded px-2 py-1 text-[10px] font-medium"
            style={{ backgroundColor: tema.primary, color: tema.onPrimary }}
          >
            Ver imóveis
          </span>
        </div>

        {/* Cartões */}
        <div className="grid grid-cols-3 gap-2 p-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border"
              style={{ borderColor: tema.border }}
            >
              <div className="h-8" style={{ backgroundColor: tema.primaryLight }} />
              <div className="space-y-1 p-1.5">
                <div className="h-1 w-full rounded bg-gray-200" />
                <div className="h-1.5 w-2/3 rounded" style={{ backgroundColor: tema.primary }} />
              </div>
            </div>
          ))}
        </div>

        {/* Rodapé */}
        <div className="px-3 py-2" style={{ backgroundColor: tema.primary }}>
          <div className="h-1 w-1/3 rounded" style={{ backgroundColor: tema.onPrimary, opacity: 0.6 }} />
        </div>
      </div>
    </div>
  );
}

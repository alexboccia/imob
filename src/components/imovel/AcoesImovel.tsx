"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import {
  IconeChevronDireito,
  IconeChevronEsquerdo,
  IconeCompartilhar,
  IconeCoracao,
  IconeWhatsApp,
} from "@/components/icons";
import { IconeFacebook, IconeLinkedin, IconeX } from "@/components/icones-sociais";
import {
  ROTULO_REDE,
  copiarTexto,
  linksDeCompartilhamento,
  textoDeCompartilhamento,
  type RedeCompartilhamento,
} from "@/lib/compartilhar-imovel";
import {
  alternarNaLista,
  armazenamentoDoNavegador,
  gravarFavoritos,
  lerFavoritos,
} from "@/lib/favoritos";
import { cn } from "@/lib/utils";

// Ações da ficha ao lado do título (Fase 47): Compartilhar e Salvar.
// Fase 48: Imóvel anterior / Próximo imóvel, no mesmo grupo — são
// navegação entre FICHAS (a ordem da listagem pública), não entre fotos.
//
// Ilha de cliente pequena — a página continua sendo Server Component.
// Nenhuma das duas ações fala com o servidor: compartilhar abre a rede
// escolhida (ou a folha nativa do celular) com a URL canônica; salvar
// grava no navegador. Nenhuma delas é contato comercial.

const CLASSE_ACAO = cn(
  buttonVariants({ variant: "outline" }),
  "h-10 gap-2 rounded-lg bg-background px-3 text-sm font-medium"
);

// Setas: redondas, 40x40 em qualquer largura (alvo de toque).
const CLASSE_SETA = cn(
  buttonVariants({ variant: "outline" }),
  "size-10 shrink-0 rounded-full bg-background p-0"
);

const ICONE_REDE: Record<RedeCompartilhamento, (p: { className?: string }) => React.ReactNode> = {
  whatsapp: IconeWhatsApp,
  facebook: IconeFacebook,
  linkedin: IconeLinkedin,
  x: IconeX,
};
const REDES: RedeCompartilhamento[] = ["whatsapp", "facebook", "linkedin", "x"];

// No celular, com folha de compartilhamento nativa, ela é o caminho mais
// útil. No desktop o menu é mais previsível do que a janela do sistema.
function deveUsarCompartilhamentoNativo(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1023px)").matches
  );
}

function CompartilharImovel({ url, titulo }: { url: string; titulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const links = linksDeCompartilhamento({ url, titulo });

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  function avisar(texto: string) {
    setAviso(texto);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(null), 2500);
  }

  async function compartilharNativo() {
    try {
      await navigator.share({ title: titulo, text: textoDeCompartilhamento(titulo), url });
    } catch (erro) {
      // Cancelar a folha nativa não é erro. Qualquer outra falha cai no
      // menu, que funciona em qualquer navegador.
      if (!(erro instanceof DOMException && erro.name === "AbortError")) setAberto(true);
    }
  }

  async function copiar() {
    avisar((await copiarTexto(url)) ? "Link copiado" : "Não foi possível copiar o link");
  }

  return (
    <div className="relative">
      <DropdownMenu
        open={aberto}
        onOpenChange={(abrir) => {
          if (abrir && deveUsarCompartilhamentoNativo()) {
            void compartilharNativo();
            return;
          }
          setAberto(abrir);
        }}
      >
        <DropdownMenuTrigger data-compartilhar-imovel className={CLASSE_ACAO}>
          <IconeCompartilhar className="size-4" />
          Compartilhar
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 p-1.5">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Compartilhar imóvel</DropdownMenuLabel>
            {REDES.map((rede) => {
              const Icone = ICONE_REDE[rede];
              return (
                <DropdownMenuLinkItem
                  key={rede}
                  href={links[rede]}
                  target="_blank"
                  rel="noopener noreferrer"
                  closeOnClick
                  data-rede={rede}
                  className="gap-2.5 px-2 py-2"
                >
                  <span aria-hidden="true" className="flex">
                    <Icone className="size-4" />
                  </span>
                  {ROTULO_REDE[rede]}
                  <span className="sr-only"> (abre em nova aba)</span>
                </DropdownMenuLinkItem>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-copiar-link className="gap-2.5 px-2 py-2" onClick={copiar}>
            <Link2 aria-hidden="true" className="size-4" />
            Copiar link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span
        role="status"
        aria-live="polite"
        data-aviso-compartilhar
        className={cn(
          "pointer-events-none absolute top-full right-0 z-10 mt-1 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow",
          !aviso && "sr-only"
        )}
      >
        {aviso ?? ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------
// Favorito
// ---------------------------------------------------------------------
// Quando o navegador bloqueia o localStorage, o favorito vale só enquanto
// a página estiver aberta (memória) — o botão continua funcionando.
const memoria = new Map<string, string[]>();
const EVENTO_FAVORITOS = "easymob:favoritos-alterados";

function favoritosAtuais(orgSlug: string): string[] {
  return memoria.get(orgSlug) ?? lerFavoritos(armazenamentoDoNavegador(), orgSlug);
}

function inscrever(aoMudar: () => void) {
  // "storage" chega quando OUTRA aba altera a lista; o evento próprio,
  // quando esta aba altera.
  window.addEventListener("storage", aoMudar);
  window.addEventListener(EVENTO_FAVORITOS, aoMudar);
  return () => {
    window.removeEventListener("storage", aoMudar);
    window.removeEventListener(EVENTO_FAVORITOS, aoMudar);
  };
}

function SalvarImovel({ imovelId, orgSlug }: { imovelId: string; orgSlug: string }) {
  // O servidor não conhece o navegador: renderiza "Salvar" e o cliente
  // corrige logo após hidratar — sem divergência de hidratação.
  const salvo = useSyncExternalStore(
    inscrever,
    () => favoritosAtuais(orgSlug).includes(imovelId),
    () => false
  );

  function alternar() {
    const nova = alternarNaLista(favoritosAtuais(orgSlug), imovelId);
    if (gravarFavoritos(armazenamentoDoNavegador(), orgSlug, nova)) memoria.delete(orgSlug);
    else memoria.set(orgSlug, nova);
    window.dispatchEvent(new Event(EVENTO_FAVORITOS));
  }

  return (
    <button
      type="button"
      data-salvar-imovel
      aria-pressed={salvo}
      title={salvo ? "Remover dos favoritos" : "Salvar nos favoritos"}
      onClick={alternar}
      // Largura mínima: "Salvar" e "Salvo" ocupam o mesmo espaço e a
      // troca após a hidratação não move nada.
      className={cn(CLASSE_ACAO, "min-w-[6.25rem] justify-center", salvo && "border-primary/40 text-primary")}
    >
      <IconeCoracao preenchido={salvo} className="size-4" />
      {salvo ? "Salvo" : "Salvar"}
      <span className="sr-only"> nos favoritos</span>
    </button>
  );
}

// Sem vizinho, a seta continua lá — um <button disabled> no mesmo
// lugar e do mesmo tamanho — para o grupo não mudar de forma entre fichas.
function SetaImovel({
  href,
  rotulo,
  direcao,
}: {
  href: string | null;
  rotulo: string;
  direcao: "anterior" | "proximo";
}) {
  const Icone = direcao === "anterior" ? IconeChevronEsquerdo : IconeChevronDireito;
  const icone = <Icone className="size-5" />;
  const dados = { "data-seta-imovel": direcao };
  if (!href) {
    return (
      <button type="button" disabled aria-label={rotulo} className={CLASSE_SETA} {...dados}>
        {icone}
      </button>
    );
  }
  return (
    <Link href={href} aria-label={rotulo} title={rotulo} className={CLASSE_SETA} {...dados}>
      {icone}
    </Link>
  );
}

export function AcoesImovel({
  imovelId,
  orgSlug,
  titulo,
  url,
  anteriorHref,
  proximoHref,
  className,
}: {
  imovelId: string;
  orgSlug: string;
  titulo: string;
  /** URL canônica da ficha (a mesma do <link rel="canonical">). */
  url: string;
  /** Ficha anterior/seguinte na ordem da listagem pública; null nas pontas. */
  anteriorHref: string | null;
  proximoHref: string | null;
  className?: string;
}) {
  return (
    <div data-acoes-imovel className={cn("flex flex-wrap items-center gap-2", className)}>
      <CompartilharImovel url={url} titulo={titulo} />
      <SalvarImovel imovelId={imovelId} orgSlug={orgSlug} />
      {/* ml-auto: quando o grupo tem a largura toda (abaixo de lg), as
          setas vão para a direita — na mesma linha se couberem, na
          seguinte se não. No desktop o grupo tem a largura do conteúdo e
          as quatro ações ficam juntas. */}
      <div data-navegacao-imoveis className="ml-auto flex items-center gap-2">
        <SetaImovel href={anteriorHref} rotulo="Imóvel anterior" direcao="anterior" />
        <SetaImovel href={proximoHref} rotulo="Próximo imóvel" direcao="proximo" />
      </div>
    </div>
  );
}

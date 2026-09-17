"use client";

import { useState } from "react";
import { IconeCompartilhar } from "@/components/icons";
import { copiarTexto, textoDeCompartilhamento } from "@/lib/compartilhar-imovel";

// Compartilhar a URL da página. Web Share API quando o navegador tem
// (celular: abre a folha nativa com WhatsApp, e-mail, etc.), e cópia pro
// clipboard com confirmação visível como alternativa — sem biblioteca.
//
// A lógica existia triplicada dentro de GaleriaFotos (barra, lightbox e
// visão em grade), o que também significava que um imóvel SEM FOTO não
// tinha como ser compartilhado: a galeria inteira não renderiza nesse
// caso. Extraído pra um componente único, usado tanto pela galeria
// quanto pelo cabeçalho do detalhe, que existe sempre.
//
// Fase 47 — hoje só o lightbox usa este botão (o cabeçalho tem o menu de
// compartilhamento). A URL vem do servidor, a MESMA canônica do
// cabeçalho; sem ela, cai no endereço atual sem query nem fragmento.
export function BotaoCompartilhar({
  titulo,
  url: urlCanonica,
  className,
  children,
}: {
  titulo: string;
  url?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [copiado, setCopiado] = useState(false);

  async function compartilhar() {
    // Sem o fragmento: se o visitante acabou de usar a âncora "Contato"
    // da barra, location.href carrega "#contato-imovel" e o link
    // compartilhado abriria rolado no formulário, não no topo do imóvel.
    const { origin, pathname } = window.location;
    const url = urlCanonica ?? `${origin}${pathname}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: textoDeCompartilhamento(titulo), url });
      } catch {
        // usuário cancelou o compartilhamento
      }
      return;
    }
    if (!(await copiarTexto(url))) return;
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={compartilhar}
        aria-label="Compartilhar"
        className={className}
      >
        <IconeCompartilhar className="size-4" />
        {children}
      </button>
      {/* aria-live: quem usa leitor de tela precisa ouvir a confirmação —
          sem isso o clique parece não ter feito nada. */}
      {copiado && (
        <span
          role="status"
          aria-live="polite"
          className="absolute top-full right-0 mt-1 whitespace-nowrap rounded bg-white px-2 py-1 text-xs text-gray-900 shadow"
        >
          Link copiado
        </span>
      )}
    </div>
  );
}

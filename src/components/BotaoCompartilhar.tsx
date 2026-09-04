"use client";

import { useState } from "react";
import { IconeCompartilhar } from "@/components/icons";

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
// window.location.href é a URL canônica do imóvel: o site público serve
// cada tenant no domínio dele (ou no caminho com slug), então o link
// copiado é sempre o endereço que o visitante deve receber.
export function BotaoCompartilhar({
  titulo,
  className,
  children,
}: {
  titulo: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [copiado, setCopiado] = useState(false);

  async function compartilhar() {
    // Sem o fragmento: se o visitante acabou de usar a âncora "Contato"
    // da barra, location.href carrega "#contato-imovel" e o link
    // compartilhado abriria rolado no formulário, não no topo do imóvel.
    const { origin, pathname, search } = window.location;
    const url = `${origin}${pathname}${search}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, url });
      } catch {
        // usuário cancelou o compartilhamento
      }
      return;
    }
    await navigator.clipboard.writeText(url);
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
          Link copiado!
        </span>
      )}
    </div>
  );
}

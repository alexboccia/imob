import { getSiteUrl } from "@/lib/site-url";

// =======================================================================
// Compartilhamento da ficha (Fase 47)
// =======================================================================
// Compartilhar é divulgar o IMÓVEL — não é contato com a imobiliária.
// Nada aqui cria pessoa, lead, interação ou evento de "clique no
// WhatsApp": o WhatsApp de compartilhamento abre o seletor de conversas
// do próprio visitante (wa.me sem número), com o título e o link.
//
// Sem SDK de rede social: só as URLs públicas de compartilhamento de cada
// serviço, com tudo passando por encodeURIComponent.
// =======================================================================

/**
 * A URL canônica da ficha — a mesma que a página declara em <link
 * rel="canonical">. Domínio próprio ATIVO quando houver; senão, o site
 * público (com o prefixo da organização, quando ela não é a do domínio
 * principal).
 */
export function urlCanonicaDoImovel(opcoes: {
  hostnameCustom: string | null;
  basePath: string;
  imovelId: string;
}): string {
  const caminho = `/imoveis/${encodeURIComponent(opcoes.imovelId)}`;
  return opcoes.hostnameCustom
    ? `https://${opcoes.hostnameCustom}${caminho}`
    : getSiteUrl(`${opcoes.basePath}${caminho}`);
}

export function textoDeCompartilhamento(titulo: string): string {
  return `Veja este imóvel: ${titulo.trim()}`;
}

export type RedeCompartilhamento = "whatsapp" | "facebook" | "linkedin" | "x";

export const ROTULO_REDE: Record<RedeCompartilhamento, string> = {
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
};

export function linksDeCompartilhamento(opcoes: {
  url: string;
  titulo: string;
}): Record<RedeCompartilhamento, string> {
  const url = encodeURIComponent(opcoes.url);
  const texto = textoDeCompartilhamento(opcoes.titulo);
  return {
    // Sem número: o WhatsApp pergunta para quem enviar.
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${texto}\n${opcoes.url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(texto)}&url=${url}`,
  };
}

/**
 * Copia um texto. Clipboard API quando existir; senão, o caminho antigo
 * (textarea + execCommand). Devolve false em vez de lançar — quem chama
 * decide o que dizer ao visitante.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // cai no caminho antigo abaixo
  }
  try {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.focus();
    campo.select();
    const ok = document.execCommand("copy");
    campo.remove();
    return ok;
  } catch {
    return false;
  }
}

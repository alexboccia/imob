import { getSiteUrl } from "@/lib/site-url";
import type { CanalLegenda } from "@/lib/legenda-imovel";

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

/**
 * URL pública da foto de capa, PRONTA para og:image/twitter:image
 * (MKT-005) — nunca a URL bruta de Media.url.
 *
 * Por quê: Media.url é o que o broker enviou, em qualquer um dos três
 * formatos aceitos no upload (jpg/png/webp — ver upload-validation.ts).
 * `.webp` é publicamente acessível e renderiza bem em qualquer navegador
 * (inclusive via next/image aqui no produto), mas o crawler de preview
 * do WhatsApp — o consumidor real desta fase — historicamente falha em
 * montar o card para imagens webp. Em vez de mudar o pipeline de upload
 * (afetaria toda foto do produto, não só preview social) ou gerar um
 * criativo da MKT-001 (teria texto/overlay, não é "a foto real"), esta
 * URL aponta para uma rota própria que baixa a MESMA foto de capa e
 * devolve um JPEG — a conversão só acontece quando um crawler de fato
 * pede a imagem, nunca dentro de generateMetadata (ver seção 33 do
 * pedido: metadata não processa imagem).
 */
export function urlOgImagemDoImovel(opcoes: {
  origin: string;
  organizationId: string;
  imovelId: string;
}): string {
  return `${opcoes.origin}/api/og-image/${encodeURIComponent(opcoes.organizationId)}/${encodeURIComponent(opcoes.imovelId)}`;
}

/**
 * URL rastreável do Kit de Divulgação (MKT-006) — a MESMA URL canônica
 * da ficha (nunca uma rota nova, nunca um encurtador), com utm_source/
 * utm_medium acrescentados para o canal escolhido. É só o que o
 * corretor copia e cola no Instagram/Facebook/WhatsApp: nada aqui cria
 * registro, clique ou evento — a captura do parâmetro acontece depois,
 * do lado de quem já existe (src/lib/atribuicao.ts, Fase 7), quando o
 * visitante efetivamente abrir o link.
 *
 * Reaproveita o MESMO catálogo de 3 canais da legenda (CanalLegenda) —
 * nenhuma enumeração nova de "de onde pode vir um link".
 *
 * utm_source=<canal> declara que ESTE link foi marcado como aquele
 * canal — não confirma que o clique realmente veio de lá (mesma
 * ressalva de qualquer UTM: é o que o remetente escreveu na URL, não o
 * que a plataforma de origem atestou).
 *
 * `URLSearchParams.set` (nunca `append`) substitui o parâmetro em vez
 * de duplicá-lo — importante porque a mesma URL base pode, em teoria,
 * já carregar um utm_source de uma campanha anterior (ex.: um link
 * colado de volta no gerador).
 *
 * Nunca mexe em `og:image`/canonical: a URL de entrada já É o
 * canonical (MKT-005), e o que esta função monta é um objeto NOVO —
 * `new URL()` nunca modifica a string recebida.
 */
export function urlRastreavelDoImovel(opcoes: { url: string; canal: CanalLegenda }): string {
  const rastreavel = new URL(opcoes.url);
  rastreavel.searchParams.set("utm_source", opcoes.canal);
  rastreavel.searchParams.set("utm_medium", "divulgacao");
  return rastreavel.toString();
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

import type { TokensTema } from "@/lib/branding/temas";

// Canal entre o editor de cores e a prévia do site (Fase 62).
//
// Os dois são cards IRMÃOS dentro da aba "Identidade visual" (colunas
// diferentes da mesma grade), não pai e filho. Três alternativas foram
// descartadas:
//   - subir o estado da paleta para o formulário: transformaria um
//     componente de servidor (ConfiguracaoContatoForm compõe SeletorTema,
//     que é server) em cliente, e re-renderizaria a tela inteira a cada
//     tecla digitada num hex;
//   - um contexto React: mesmo problema de fronteira, por um provider a
//     mais só para dois consumidores;
//   - ler o DOM na prévia: funciona para o que o usuário DIGITA (dispara
//     `input`), mas não para o que o código escreve — gerar pelo logotipo
//     e o conta-gotas mudam o estado sem evento de DOM, e a prévia ficaria
//     para trás justamente nas duas ações mais visuais.
//
// Um CustomEvent no `window` resolve sem nenhum dos três custos. Não é um
// segundo sistema de persistência: nada aqui grava nada, o valor vive no
// estado do editor e viaja no FormData pelos inputs com `name`.
export const EVENTO_PALETA_PREVIA = "easymob:paleta-previa";

export type DetalhePaletaPrevia = { tokens: TokensTema };

export function publicarPaleta(tokens: TokensTema): void {
  // `window` não existe no SSR; o editor é um componente de cliente, mas
  // a guarda mantém a função segura de chamar em qualquer contexto.
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DetalhePaletaPrevia>(EVENTO_PALETA_PREVIA, { detail: { tokens } })
  );
}

export function assinarPaleta(ouvinte: (tokens: TokensTema) => void): () => void {
  if (typeof window === "undefined") return () => {};
  function manipular(evento: Event) {
    const detalhe = (evento as CustomEvent<DetalhePaletaPrevia>).detail;
    if (detalhe?.tokens) ouvinte(detalhe.tokens);
  }
  window.addEventListener(EVENTO_PALETA_PREVIA, manipular);
  return () => window.removeEventListener(EVENTO_PALETA_PREVIA, manipular);
}

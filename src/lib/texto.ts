// Remove acentos e caixa alta para permitir busca/comparação tolerante.
export function normalizarTexto(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Ordem canônica de nomes em português (acento não pode jogar "Área" pro
// fim da lista). Era privada de caracteristicas.ts, onde ordena o
// catálogo administrativo; virou compartilhada quando a ficha pública
// passou a exibir as características na MESMA ordem em que o cadastro as
// oferece (ver caracteristicas-ficha.ts).
export function ordenarPtBr(nomes: string[]): string[] {
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

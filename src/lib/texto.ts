// Remove acentos e caixa alta para permitir busca/comparação tolerante.
export function normalizarTexto(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

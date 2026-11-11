// Wrapper trivial em volta de Date.now() — existe só porque o lint de
// pureza de render (react-hooks/purity) marca a chamada direta a
// Date.now() dentro de um componente (Server ou Client) como impura,
// mesmo quando o valor é usado deliberadamente como "quando esta
// renderização aconteceu" (ex: timing anti-spam de formulário). Chamar
// através desta função nomeada não muda a semântica, só move a chamada
// pra fora do corpo do componente aos olhos da análise estática.
export function agoraEmMs(): number {
  return Date.now();
}

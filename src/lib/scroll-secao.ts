// Redesign da tela de edição de imóvel — navegação horizontal por
// âncoras (nunca abas que desmontam o formulário: todas as seções
// continuam montadas o tempo todo, só a posição de rolagem muda).
// Função plana, reusada pela barra de navegação E pelo botão "Ver
// fotos (N)" do card de resumo — ambos rolam até a MESMA seção.
export function rolarParaSecaoImovel(id: string) {
  const elemento = document.getElementById(id);
  if (!elemento) return;
  const prefereReduzirMovimento = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  elemento.scrollIntoView({
    behavior: prefereReduzirMovimento ? "auto" : "smooth",
    block: "start",
  });
}

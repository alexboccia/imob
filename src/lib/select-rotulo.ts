// Rótulo de exibição de um <Select> CONTROLADO (Base UI).
//
// Por que este arquivo existe: `Select.Value` do Base UI, quando o Select
// é controlado (`value` + `onValueChange`), renderiza o VALOR CRU da
// opção selecionada em vez do rótulo do `SelectItem` correspondente. Em
// produção isso aparecia em duas telas PÚBLICAS:
//
//   - Home, "Tipo de imóvel"  -> "__TODOS__"   (era "Todos os imóveis")
//   - /imoveis, "Ordenar por" -> "relevantes"  (era "Mais relevantes")
//
// O bug já estava documentado em UsuariosFiltrosBar.tsx, que o contornou
// trocando o componente por um `<select>` nativo. Aqui a correção é
// menor e mais cirúrgica: `Select.Value` aceita `children` como FUNÇÃO
// de formatação (`(value) => ReactNode`) — é a API oficial do Base UI
// pra exatamente este caso.
//
// IMPORTANTE: isto muda SOMENTE a REPRESENTAÇÃO VISUAL. O valor do
// estado, o `name` do campo, o valor submetido no form e o `value` de
// cada `SelectItem` continuam idênticos — nenhuma query, nenhum filtro e
// nenhuma sentinela mudam de semântica.

// Regras, nesta ordem:
//   1. valor ausente/não-string/vazio  -> textoSemSelecao (placeholder);
//   2. valor com rótulo no catálogo    -> o rótulo;
//   3. valor sem rótulo no catálogo    -> o próprio valor.
//
// A regra 3 existe porque nem toda opção tem rótulo diferente do valor:
// no seletor de tipo da Home, os tipos reais são renderizados com o
// próprio nome ("Apartamento" tem value "Apartamento"), e só a sentinela
// precisa de tradução. Mapear tipo por tipo ali exigiria duplicar o
// catálogo dinâmico de PropertyTypeOption dentro do componente.
//
// Object.hasOwn (não `in`): sem isso, um valor como "toString" ou
// "constructor" acharia um "rótulo" na cadeia de protótipos e exibiria
// código-fonte de função na tela. Mesma defesa já usada em captacao.ts.
export function rotuloSelecionado(
  valor: unknown,
  rotulos: Readonly<Record<string, string>>,
  textoSemSelecao: string
): string {
  if (typeof valor !== "string" || valor === "") return textoSemSelecao;
  return Object.hasOwn(rotulos, valor) ? rotulos[valor] : valor;
}

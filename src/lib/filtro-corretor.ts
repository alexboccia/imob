// Faceta "imóveis deste corretor" da listagem pública.
//
// É UMA FACETA, não uma segunda listagem: /imoveis?corretor=<id> passa
// pelo mesmo motor de filtros, a mesma query, a mesma paginação e a
// mesma ordenação de sempre. Não existe /corretores/{id}/imoveis, e é
// deliberado — duas listagens divergiriam no dia em que um filtro novo
// entrasse só numa delas.
//
// Este arquivo é PURO de propósito (nenhum import de Prisma): o nome do
// parâmetro, como ele é lido da URL e como ele é removido dela são
// regras que perfil, listagem, paginação e testes precisam compartilhar
// sem depender de banco.

// O nome do parâmetro vive AQUI e em nenhum outro lugar. Os searchParams
// públicos deste produto são em português (busca, finalidade, bairro,
// precoMin, ordenar...), então "corretor" — não "broker", não "agent".
export const PARAM_CORRETOR = "corretor";

// Um cuid do OrganizationMember. O formato é validado antes de virar
// filtro por dois motivos: um valor com 10 mil caracteres ou com
// caracteres estranhos não é um id legítimo (é sonda), e recusá-lo aqui
// evita levá-lo até a query.
const TAMANHO_MAXIMO_ID = 64;
const FORMATO_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Lê o filtro de corretor da URL. Devolve o id cru (ainda NÃO validado
 * contra o banco — quem faz isso é resolverCorretorDoFiltro) ou null.
 *
 * `?corretor=a&corretor=b` chega como array: vale o primeiro, porque o
 * filtro é de um profissional só e ignorar o resto é mais previsível que
 * recusar a URL inteira.
 */
export function interpretarFiltroCorretor(
  valor: string | string[] | undefined
): string | null {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (!bruto) return null;
  const id = bruto.trim();
  if (!id || id.length > TAMANHO_MAXIMO_ID || !FORMATO_ID.test(id)) return null;
  return id;
}

/**
 * Destino do "Ver todos os imóveis" do perfil: a listagem pública já
 * filtrada. Um lugar só — o perfil monta o CTA e os testes conferem o
 * destino pela mesma função.
 */
export function hrefListagemDoCorretor(basePath: string, membroId: string): string {
  return `${basePath}/imoveis?${PARAM_CORRETOR}=${encodeURIComponent(membroId)}`;
}

/**
 * A URL de remover SÓ o filtro de corretor: todos os outros parâmetros
 * seguem intactos (bairro, preço, tipo, ordenação...).
 *
 * `page` cai junto, e isso é a convenção que os outros filtros já usam:
 * FiltrosImoveis remonta a query sem `page` sempre que a busca muda,
 * porque a página 4 de um conjunto não descreve nada na página 1 de
 * outro.
 */
export function hrefSemFiltroCorretor(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(searchParams)) {
    if (chave === PARAM_CORRETOR || chave === "page" || valor === undefined) continue;
    if (Array.isArray(valor)) valor.forEach((v) => query.append(chave, v));
    else query.set(chave, valor);
  }
  const texto = query.toString();
  return `${basePath}/imoveis${texto ? `?${texto}` : ""}`;
}

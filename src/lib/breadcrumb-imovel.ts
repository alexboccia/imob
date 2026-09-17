// =======================================================================
// Breadcrumb comercial da ficha do imóvel (Fase 46)
// =======================================================================
// Cada nível é uma LISTAGEM PÚBLICA QUE JÁ EXISTE — /imoveis com os
// mesmos parâmetros que o menu do site e os filtros usam (finalidade,
// lancamento, tipo, cidade, bairro). Nada aqui inventa rota.
//
//   Home > Lançamentos|Comprar|Alugar|Imóveis > {tipo} > {bairro}
//
// Os níveis são cumulativos: "Apartamento" leva aos apartamentos DAQUELA
// listagem, e o bairro, aos apartamentos daquela listagem naquele bairro
// (com a cidade junto, porque "Centro" existe em muitas cidades).
//
// "Lançamentos" segue a mesma regra do filtro ?lancamento=1 e do rótulo
// "Lançamento" da ficha: o campo isLaunch. Um imóvel só em obra, sem o
// rótulo, não está naquela listagem — e o link não pode prometer isso.
// =======================================================================

export type MigalhaImovel = { label: string; href: string };

type ImovelParaBreadcrumb = {
  isLaunch: boolean;
  purpose: string;
  type: string | null;
  neighborhood: string | null;
  city: string | null;
};

type Parametros = Record<string, string>;

function listagem(basePath: string, parametros: Parametros): string {
  const qs = new URLSearchParams(parametros).toString();
  return `${basePath}/imoveis${qs ? `?${qs}` : ""}`;
}

/** O nível comercial: a listagem do menu à qual o imóvel pertence. */
function nivelComercial(imovel: ImovelParaBreadcrumb): { label: string; parametros: Parametros } {
  if (imovel.isLaunch) return { label: "Lançamentos", parametros: { lancamento: "1" } };
  // Os rótulos são os do menu do site. Venda E locação não cabe em
  // nenhuma das duas listagens (o filtro compara a finalidade exata),
  // então sobe para a listagem geral.
  if (imovel.purpose === "SALE") return { label: "Comprar", parametros: { finalidade: "SALE" } };
  if (imovel.purpose === "RENT") return { label: "Alugar", parametros: { finalidade: "RENT" } };
  return { label: "Imóveis", parametros: {} };
}

const preenchido = (valor: string | null | undefined): valor is string =>
  typeof valor === "string" && valor.trim().length > 0;

export function migalhasDoImovel(basePath: string, imovel: ImovelParaBreadcrumb): MigalhaImovel[] {
  const migalhas: MigalhaImovel[] = [{ label: "Home", href: basePath || "/" }];

  const comercial = nivelComercial(imovel);
  let parametros = comercial.parametros;
  migalhas.push({ label: comercial.label, href: listagem(basePath, parametros) });

  if (preenchido(imovel.type)) {
    const tipo = imovel.type.trim();
    parametros = { ...parametros, tipo };
    migalhas.push({ label: tipo, href: listagem(basePath, parametros) });
  }

  // Bairro, com a cidade no filtro. Sem bairro, a cidade é o contexto
  // verdadeiro mais próximo; sem nenhum dos dois, o nível não existe.
  if (preenchido(imovel.neighborhood)) {
    const bairro = imovel.neighborhood.trim();
    parametros = {
      ...parametros,
      ...(preenchido(imovel.city) ? { cidade: imovel.city.trim() } : {}),
      bairro,
    };
    migalhas.push({ label: bairro, href: listagem(basePath, parametros) });
  } else if (preenchido(imovel.city)) {
    const cidade = imovel.city.trim();
    parametros = { ...parametros, cidade };
    migalhas.push({ label: cidade, href: listagem(basePath, parametros) });
  }

  return migalhas;
}

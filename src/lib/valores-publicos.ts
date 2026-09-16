import { formatarPreco } from "@/lib/format";

// =======================================================================
// Valores públicos do imóvel (Fase 43)
// =======================================================================
// UMA regra para os três lugares da ficha que mostram preço: o card
// lateral, o cabeçalho comercial (desktop) e a barra fixa (mobile).
// Antes a barra decidia sozinha (`price ?? rentPrice`) e, num imóvel de
// venda E locação, escondia o aluguel que o card lateral mostrava.
//
// Só entra o que está persistido. Sem preço, a lista vem vazia — quem
// renderiza não inventa "Consulte-nos", "A partir de" nem nada parecido.
//
// Periodicidade: só o aluguel é mensal por definição do domínio (o
// formulário pede "Preço de aluguel (R$/mês)"). Condomínio e IPTU são
// cadastrados como "(R$)", sem período — por isso aparecem sem sufixo.
// =======================================================================

export type PrecoPublico = {
  chave: "venda" | "aluguel";
  /** Já formatado em BRL. */
  valor: string;
  /** "/mês" no aluguel; null na venda. */
  sufixo: string | null;
  /**
   * "Para comprar" / "Para alugar" — só quando o imóvel é de venda E
   * locação, que é quando o visitante precisa distinguir os dois.
   */
  rotulo: string | null;
};

export type CustoPublico = {
  chave: "condominio" | "iptu";
  rotulo: string;
  valor: string;
};

type ImovelComValores = {
  price: unknown;
  rentPrice: unknown;
  purpose: string;
};

const ausente = (valor: unknown) => valor === null || valor === undefined;

/** Preços na ordem de exibição: venda, depois aluguel. */
export function precosPublicos(imovel: ImovelComValores): PrecoPublico[] {
  const ambos = imovel.purpose === "SALE_AND_RENT";
  const precos: PrecoPublico[] = [];
  if (!ausente(imovel.price)) {
    precos.push({
      chave: "venda",
      valor: formatarPreco(imovel.price),
      sufixo: null,
      rotulo: ambos ? "Para comprar" : null,
    });
  }
  if (!ausente(imovel.rentPrice)) {
    precos.push({
      chave: "aluguel",
      valor: formatarPreco(imovel.rentPrice),
      sufixo: "/mês",
      rotulo: ambos ? "Para alugar" : null,
    });
  }
  return precos;
}

/** Custos recorrentes cadastrados — cada um só existe se preenchido. */
export function custosPublicos(imovel: { condoFee: unknown; propertyTax: unknown }): CustoPublico[] {
  const custos: CustoPublico[] = [];
  if (!ausente(imovel.condoFee)) {
    custos.push({ chave: "condominio", rotulo: "Condomínio", valor: formatarPreco(imovel.condoFee) });
  }
  if (!ausente(imovel.propertyTax)) {
    custos.push({ chave: "iptu", rotulo: "IPTU", valor: formatarPreco(imovel.propertyTax) });
  }
  return custos;
}

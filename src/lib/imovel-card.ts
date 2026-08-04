type ImovelParaCard = {
  id: string;
  titulo: string;
  tipo: string;
  finalidade: string;
  bairro: string;
  cidade: string;
  estado: string;
  preco: { toString(): string } | null;
  precoAluguel: { toString(): string } | null;
  quartos: number | null;
  vagasGaragem: number | null;
  lancamento: boolean;
  destaque: boolean;
  oportunidade: boolean;
  midias: { url: string }[];
};

export function paraImovelCard(imovel: ImovelParaCard) {
  return {
    id: imovel.id,
    titulo: imovel.titulo,
    tipo: imovel.tipo,
    finalidade: imovel.finalidade,
    bairro: imovel.bairro,
    cidade: imovel.cidade,
    estado: imovel.estado,
    preco: imovel.preco ? imovel.preco.toString() : null,
    precoAluguel: imovel.precoAluguel ? imovel.precoAluguel.toString() : null,
    quartos: imovel.quartos,
    vagasGaragem: imovel.vagasGaragem,
    lancamento: imovel.lancamento,
    destaque: imovel.destaque,
    oportunidade: imovel.oportunidade,
    midias: imovel.midias.map((m) => ({ url: m.url })),
  };
}

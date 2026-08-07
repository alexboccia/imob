type ImovelParaCard = {
  id: string;
  title: string;
  type: string;
  purpose: string;
  neighborhood: string;
  city: string;
  state: string;
  price: { toString(): string } | null;
  rentPrice: { toString(): string } | null;
  bedrooms: number | null;
  parkingSpots: number | null;
  isLaunch: boolean;
  isFeatured: boolean;
  isOpportunity: boolean;
  media: { url: string }[];
};

export function paraImovelCard(imovel: ImovelParaCard) {
  return {
    id: imovel.id,
    titulo: imovel.title,
    tipo: imovel.type,
    finalidade: imovel.purpose,
    bairro: imovel.neighborhood,
    cidade: imovel.city,
    estado: imovel.state,
    preco: imovel.price ? imovel.price.toString() : null,
    precoAluguel: imovel.rentPrice ? imovel.rentPrice.toString() : null,
    quartos: imovel.bedrooms,
    vagasGaragem: imovel.parkingSpots,
    lancamento: imovel.isLaunch,
    destaque: imovel.isFeatured,
    oportunidade: imovel.isOpportunity,
    midias: imovel.media.map((m) => ({ url: m.url })),
  };
}

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
  // Área e banheiros entram no DTO para a linha de atributos do card.
  // Não é consulta nova: a Home já trazia a linha inteira do imóvel
  // (include sem select), e a listagem só precisou de duas colunas
  // escalares a mais no select que já existia.
  totalArea: number | null;
  bathrooms: number | null;
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
    areaTotal: imovel.totalArea,
    banheiros: imovel.bathrooms,
    vagasGaragem: imovel.parkingSpots,
    lancamento: imovel.isLaunch,
    destaque: imovel.isFeatured,
    oportunidade: imovel.isOpportunity,
    midias: imovel.media.map((m) => ({ url: m.url })),
  };
}

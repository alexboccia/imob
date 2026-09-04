// Mensagens de contato contextualizadas por imóvel — a frase que vai no
// WhatsApp e o texto que já vem preenchido no formulário. Ficavam
// montadas inline no detalhe do imóvel; extraídas porque a página de
// lançamento (fase seguinte) precisa exatamente das mesmas mensagens, e
// duplicar isso é como as duas páginas passariam a "falar" diferente com
// o mesmo tenant.
//
// Só entra aqui dado que existe de verdade em Property/Organization: nada
// de prazo de retorno, corretor, avaliação ou qualquer coisa que o
// sistema não saiba. Campos ausentes somem da frase em vez de virarem
// "undefined" ou vírgula solta.
import { formatarCodigoImovel, formatarPreco } from "@/lib/format";

export type ImovelParaContato = {
  title: string;
  code: number;
  type: string;
  purpose: string;
  neighborhood: string;
  city: string;
  state: string;
  street?: string | null;
  number?: string | null;
  price?: unknown;
  rentPrice?: unknown;
};

// "Rua X, 100 - Centro" a partir do que estiver preenchido. Nunca inventa
// número nem expõe complemento (que continua fora do site público).
export function enderecoPublico(imovel: {
  street?: string | null;
  number?: string | null;
  neighborhood: string;
}): string {
  const logradouro =
    imovel.street && imovel.number
      ? `${imovel.street}, ${imovel.number}`
      : imovel.street;
  return [logradouro, imovel.neighborhood].filter(Boolean).join(" - ");
}

// Mensagem do WhatsApp. Identifica o imóvel por título e CÓDIGO — que é
// como corretor e cliente se referem a um anúncio no telefone — em vez de
// repetir preço e endereço, que o corretor já tem no sistema a partir do
// código. Sem link: o visitante está saindo DA página do imóvel, e o
// WhatsApp já mostra de onde a conversa começou quando o número é
// clicado a partir do site.
export function mensagemWhatsAppImovel(
  imovel: ImovelParaContato,
  prefixoCodigo?: string | null
): string {
  const codigo = formatarCodigoImovel(imovel.code, prefixoCodigo);
  return (
    `Olá! Tenho interesse no imóvel "${imovel.title}" (cód. ${codigo}), ` +
    `em ${imovel.neighborhood}, ${imovel.city}. Gostaria de mais informações.`
  );
}

// Texto que já vem no campo "Mensagem" do formulário — mais completo que
// o do WhatsApp porque aqui o corretor recebe um lead frio, sem o
// histórico da conversa, então preço e endereço ajudam a identificar o
// anúncio. Preserva a frase que a página já usava, só passa a montar o
// endereço pelo helper acima.
export function mensagemFormularioImovel(
  imovel: ImovelParaContato,
  nomeOrganizacao: string
): string {
  const verbo =
    imovel.purpose === "RENT"
      ? "alugar"
      : imovel.purpose === "SALE_AND_RENT"
        ? "comprar ou alugar"
        : "comprar";
  const endereco = enderecoPublico(imovel);
  const preco = formatarPreco(imovel.price ?? imovel.rentPrice);
  return (
    `Olá, gostaria de ter mais informações para ${verbo}: ` +
    `${imovel.type.toLowerCase()}, ${preco}, ` +
    `${endereco ? `${endereco}, ` : ""}${imovel.city} - ${imovel.state} ` +
    `que encontrei no site da ${nomeOrganizacao}. Aguardo seu contato.`
  );
}

// Gerador de criativos de marketing (MKT-001) — regras de dados e
// formato, sem nenhuma dependência de I/O (sharp/fetch/prisma): este
// módulo é seguro para importar tanto no Route Handler (servidor) quanto
// no diálogo client-side, para que a lista "quais informações serão
// usadas" exibida ANTES de gerar a imagem venha exatamente das mesmas
// funções que decidem o que entra no render final — nunca duas versões
// da mesma regra.

export type FormatoAnuncioId = "feed" | "story" | "whatsapp";

export type FormatoAnuncio = {
  id: FormatoAnuncioId;
  rotulo: string;
  largura: number;
  altura: number;
};

// Dimensões documentadas (seção 7 do pedido):
//   Feed  1080×1350 (4:5) — máximo vertical que o Instagram não corta no
//         feed, padrão de mercado para anúncio de imóvel.
//   Story 1080×1920 (9:16) — tela cheia do formato Stories/Reels.
//   WhatsApp 1080×1080 (1:1) — decisão desta V1: quadrado em vez de
//         reaproveitar um dos dois formatos acima. Uma imagem 4:5 ou 9:16
//         enviada num chat aparece cortada/pequena na pré-visualização em
//         miniatura do WhatsApp (ambos os lados), e reaproveitar o Story
//         (9:16) tornaria o texto ilegível quando usado como Status
//         (que já é 9:16 nativo — sem diferenciação). Quadrado é o
//         formato que chega inteiro tanto no chat quanto num Status,
//         sem recorte adicional pelo app.
export const FORMATOS_ANUNCIO: readonly FormatoAnuncio[] = [
  { id: "feed", rotulo: "Instagram Feed", largura: 1080, altura: 1350 },
  { id: "story", rotulo: "Instagram Story", largura: 1080, altura: 1920 },
  { id: "whatsapp", rotulo: "WhatsApp", largura: 1080, altura: 1080 },
];

export function formatoAnuncioPorId(id: string): FormatoAnuncio | null {
  return FORMATOS_ANUNCIO.find((f) => f.id === id) ?? null;
}

export type FinalidadeAnuncio = "SALE" | "RENT";

// Rótulo usado NO CRIATIVO — distinto de FINALIDADE_LABEL (format.ts),
// que fala com o CORRETOR navegando o painel/site ("Comprar"/"Alugar").
// Aqui o texto fala com quem VÊ o anúncio pronto, no padrão de placa
// imobiliária.
export const FINALIDADE_ANUNCIO_LABEL: Record<FinalidadeAnuncio, string> = {
  SALE: "À venda",
  RENT: "Para alugar",
};

// Seção 9 do pedido: SALE_AND_RENT nunca escolhe sozinho. SALE e RENT
// isolados têm exatamente UMA finalidade válida para o criativo — não há
// o que perguntar. Preço ausente (price/rentPrice null) NÃO remove a
// opção da lista: a opção é sobre qual RÓTULO o imóvel pode anunciar,
// não sobre ter ou não um valor pra mostrar (formatarPreco já resolve
// "Consulte-nos" separadamente).
export function opcoesFinalidadeAnuncio(purpose: string): FinalidadeAnuncio[] {
  if (purpose === "SALE") return ["SALE"];
  if (purpose === "RENT") return ["RENT"];
  if (purpose === "SALE_AND_RENT") return ["SALE", "RENT"];
  return [];
}

export function finalidadeAnuncioAmbigua(purpose: string): boolean {
  return opcoesFinalidadeAnuncio(purpose).length > 1;
}

// Revalidação do lado servidor: um `finalidade` vindo de query string pode
// ter sido adulterado — nunca aceitar um valor que o purpose real do
// imóvel não suporta (ex.: "RENT" numa property SALE).
export function finalidadeAnuncioValida(
  purpose: string,
  finalidade: string | null
): finalidade is FinalidadeAnuncio {
  return (
    (finalidade === "SALE" || finalidade === "RENT") &&
    opcoesFinalidadeAnuncio(purpose).includes(finalidade)
  );
}

// Preço a mostrar no criativo, já escolhido pela finalidade resolvida —
// nunca um fallback implícito price ?? rentPrice (esse é o atalho que
// ImovelCard/previa-identidade-data já usam para a finalidade ÚNICA de
// cada um, mas aqui a finalidade já foi decidida explicitamente antes
// desta chamada, então não há ambiguidade a resolver de novo).
export function precoParaFinalidadeAnuncio(
  finalidade: FinalidadeAnuncio,
  precos: { price: number | null; rentPrice: number | null }
): number | null {
  return finalidade === "SALE" ? precos.price : precos.rentPrice;
}

// Mesma regra de tenant-scoping de todo o projeto (ex.:
// imovelValidoParaOrganizacao em upload-validation.ts): a mídia só é
// aceita quando pertence À MESMA property que o chamador já tem direito
// de ver — nunca confiar num mediaId solto vindo do cliente.
export function midiaPertenceAoImovel(
  midia: { propertyId: string } | null | undefined,
  propertyId: string
): boolean {
  return midia?.propertyId === propertyId;
}

// Nome de arquivo previsível e seguro: sem acento (facilita em qualquer
// SO/app), sem dado sensível (nenhum id, nenhum valor financeiro), só o
// que já é público no próprio anúncio (título, localização, formato).
function paraSlug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nomeArquivoAnuncio(dados: {
  titulo: string;
  cidade: string;
  formatoId: FormatoAnuncioId;
}): string {
  const partes = [dados.titulo, dados.cidade, dados.formatoId]
    .map(paraSlug)
    .filter(Boolean);
  return `${partes.join("-") || "anuncio"}.png`;
}

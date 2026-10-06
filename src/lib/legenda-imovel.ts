// Gerador de legenda de divulgação (MKT-003) — 100% determinístico, sem
// IA: o projeto não tem nenhuma infraestrutura de LLM hoje (nenhuma
// dependência, nenhuma env var, nenhum provider — investigado antes de
// qualquer linha de código desta fase), e a instrução explícita desta
// fase é não introduzir uma nova integração externa só para "deixar o
// texto mais bonito". Fatos reais + formatação por canal já resolvem o
// pedido sem esse risco.
//
// Mesma separação de anuncio-imovel.ts/anuncio-imovel-render.ts: este
// arquivo não faz I/O, é seguro para o client e para o server, e a
// camada de FATOS (montarFatosLegenda) é separada da camada de
// APRESENTAÇÃO (formatarLegenda*) — nenhum "if bedrooms" duplicado em
// cada canal.
import { formatarPreco, formatarLocalizacaoImovel } from "@/lib/format";
import { montarItensUnidade } from "@/lib/caracteristicas-ficha";
import { custosPublicos } from "@/lib/valores-publicos";
import {
  FINALIDADE_ANUNCIO_LABEL,
  precoParaFinalidadeAnuncio,
  type FinalidadeAnuncio,
} from "@/lib/anuncio-imovel";
import { normalizarTexto } from "@/lib/texto";

export type CanalLegenda = "instagram" | "facebook" | "whatsapp";

export const CANAIS_LEGENDA: readonly { id: CanalLegenda; rotulo: string }[] = [
  { id: "instagram", rotulo: "Instagram" },
  { id: "facebook", rotulo: "Facebook" },
  { id: "whatsapp", rotulo: "WhatsApp" },
];

// Fatos PUBLICÁVEIS e já normalizados — a única entrada que os três
// formatadores de canal recebem. Nada aqui é opinião ("espaçoso",
// "charmoso"): é o mesmo dado que já alimenta o criativo visual
// (MKT-001/002), só reorganizado para texto corrido.
export type FatosLegendaImovel = {
  tipo: string;
  finalidadeLabel: string; // "À venda" | "Para alugar" — já resolvido, nunca os dois juntos
  precoFormatado: string | null; // null = omite a linha (nunca "Consulte-nos" numa legenda — seção 14)
  custos: { rotulo: string; valor: string }[]; // Condomínio/IPTU, só quando cadastrados
  localizacao: string;
  itensEstrutura: string[]; // quartos/banheiros/vagas/área, já sem zero-como-ausência
  nomeOrganizacao: string;
  whatsapp: string | null; // já validado (temWhatsApp) por quem chama
};

export function montarFatosLegenda(dados: {
  type: string;
  finalidade: FinalidadeAnuncio;
  precos: { price: number | null; rentPrice: number | null };
  condoFee: unknown;
  propertyTax: unknown;
  neighborhood: string;
  city: string;
  state: string;
  totalArea: number | null;
  privateArea: number | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  nomeOrganizacao: string;
  whatsapp: string | null;
}): FatosLegendaImovel {
  const preco = precoParaFinalidadeAnuncio(dados.finalidade, dados.precos);
  return {
    tipo: dados.type,
    finalidadeLabel: FINALIDADE_ANUNCIO_LABEL[dados.finalidade],
    precoFormatado: preco !== null ? formatarPreco(preco) : null,
    custos: custosPublicos({ condoFee: dados.condoFee, propertyTax: dados.propertyTax }),
    localizacao: formatarLocalizacaoImovel(dados.neighborhood, dados.city, dados.state),
    itensEstrutura: montarItensUnidade({
      totalArea: dados.totalArea,
      privateArea: dados.privateArea,
      bedrooms: dados.bedrooms,
      suites: dados.suites,
      bathrooms: dados.bathrooms,
      parkingSpots: dados.parkingSpots,
      propertyFeatures: [],
    })
      .filter((item) => item.icone !== "catalogo")
      .map((item) => item.texto),
    nomeOrganizacao: dados.nomeOrganizacao,
    whatsapp: dados.whatsapp,
  };
}

// CTA seguro (seção 13): nunca promete um fluxo que o produto não tem.
// "Agendar uma visita" é uma tela pública real (AgendarVisita.tsx), mas
// amarrar o texto a ela exigiria saber se ESTE imóvel está disponível
// pra isso — informação que a legenda não tem e não deveria descobrir
// sozinha. O convite genérico "entre em contato" é sempre verdadeiro,
// com ou sem WhatsApp configurado.
function montarCta(fatos: FatosLegendaImovel): string {
  return fatos.whatsapp
    ? `Fale com ${fatos.nomeOrganizacao} pelo WhatsApp: ${fatos.whatsapp}`
    : `Entre em contato com ${fatos.nomeOrganizacao} para mais informações.`;
}

function linhaPreco(fatos: FatosLegendaImovel): string | null {
  if (!fatos.precoFormatado) return null;
  const sufixo = fatos.finalidadeLabel === FINALIDADE_ANUNCIO_LABEL.RENT ? "/mês" : "";
  return `${fatos.precoFormatado}${sufixo}`;
}

function linhaCustos(fatos: FatosLegendaImovel): string | null {
  if (fatos.custos.length === 0) return null;
  return fatos.custos.map((c) => `${c.rotulo}: ${c.valor}`).join(" · ");
}

// Hashtag a partir de um fato seguro (tipo/bairro/cidade) — nunca de
// texto livre. "São Paulo" -> "SaoPaulo": sem acento, sem espaço,
// CamelCase, formato padrão de hashtag.
function paraHashtag(texto: string): string {
  const semAcento = normalizarTexto(texto);
  return semAcento
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join("");
}

// Seção 19: derivadas só de fatos seguros (tipo cadastrado no catálogo,
// bairro/cidade), tetadas em poucas — isto não é uma engine de SEO.
// `localizacao` em FatosLegendaImovel já vem combinada ("Bairro, Cidade
// - UF") para a frase de abertura; hashtag precisa das partes soltas,
// por isso recebe bairro/cidade separados de quem já os tem (o
// montador de fatos original do anúncio, mesma fonte da MKT-001).
function hashtagsInstagram(tipo: string, bairro: string | null, cidade: string): string[] {
  const candidatas = [tipo, bairro, cidade, "Imoveis"].filter((v): v is string => Boolean(v));
  const unicas = Array.from(new Set(candidatas.map(paraHashtag).filter(Boolean)));
  return unicas.slice(0, 5).map((h) => `#${h}`);
}

// Junta PARÁGRAFOS não-vazios com linha em branco entre eles — cada
// bloco (abertura / itens+preço+custos / CTA / hashtags) é uma unidade;
// nunca depende de qual bloco anterior existiu pra decidir a própria
// quebra de linha (bug real encontrado na inspeção manual: sem isto, um
// imóvel com preço mas sem nenhum item estrutural colava o preço direto
// na frase de abertura, sem respiro).
function juntarParagrafos(paragrafos: (string | null)[]): string {
  return paragrafos.filter((p): p is string => Boolean(p)).join("\n\n");
}

// Junta LINHAS dentro de um mesmo parágrafo (sem linha em branco entre
// elas) — usado para o bloco itens+preço+custos, que é um único bloco
// visual mesmo quando alguma das três partes está ausente.
function juntarLinhas(linhas: (string | null)[]): string | null {
  const presentes = linhas.filter((l): l is string => Boolean(l));
  return presentes.length > 0 ? presentes.join("\n") : null;
}

function abertura(fatos: FatosLegendaImovel): string {
  return `${fatos.tipo} ${fatos.finalidadeLabel.toLowerCase()} em ${fatos.localizacao}.`;
}

export function formatarLegendaInstagram(
  fatos: FatosLegendaImovel,
  localizacaoPartes: { bairro: string | null; cidade: string }
): string {
  const blocoFatos = juntarLinhas([
    fatos.itensEstrutura.join(" • ") || null,
    linhaPreco(fatos),
    linhaCustos(fatos),
  ]);

  const hashtags = hashtagsInstagram(fatos.tipo, localizacaoPartes.bairro, localizacaoPartes.cidade);

  return juntarParagrafos([
    abertura(fatos),
    blocoFatos,
    montarCta(fatos),
    hashtags.length > 0 ? hashtags.join(" ") : null,
  ]);
}

export function formatarLegendaFacebook(fatos: FatosLegendaImovel): string {
  const preco = linhaPreco(fatos);
  const custos = linhaCustos(fatos);
  const blocoFatos = juntarLinhas([
    fatos.itensEstrutura.length > 0 ? `${fatos.itensEstrutura.join(", ")}.` : null,
    preco ? `Valor: ${preco}.` : null,
    custos ? `${custos}.` : null,
  ]);

  return juntarParagrafos([abertura(fatos), blocoFatos, montarCta(fatos)]);
}

export function formatarLegendaWhatsapp(fatos: FatosLegendaImovel): string {
  const preco = linhaPreco(fatos);
  // *negrito* é formatação real do WhatsApp (seção 11 — preservar
  // compatibilidade quando aplicável), não um símbolo decorativo.
  const blocoFatos = juntarLinhas([
    fatos.itensEstrutura.length > 0 ? fatos.itensEstrutura.join(" | ") : null,
    preco ? `*${preco}*` : null,
    linhaCustos(fatos),
  ]);

  return juntarParagrafos([abertura(fatos), blocoFatos, montarCta(fatos)]);
}

export function formatarLegenda(
  canal: CanalLegenda,
  fatos: FatosLegendaImovel,
  localizacaoPartes: { bairro: string | null; cidade: string }
): string {
  if (canal === "instagram") return formatarLegendaInstagram(fatos, localizacaoPartes);
  if (canal === "facebook") return formatarLegendaFacebook(fatos);
  return formatarLegendaWhatsapp(fatos);
}

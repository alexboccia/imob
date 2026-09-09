import { validarUrlMidiaOrganizacao } from "@/lib/branding/favicon-url";

// Materiais de apresentação de um imóvel — book, plantas, tabela de
// preços, memorial. Aqui mora TUDO que decide o que é um material
// válido; a Server Action só orquestra.
//
// Duas fronteiras de confiança que este arquivo existe pra defender:
//
//  1. A lista chega do formulário do painel como JSON (mesmo padrão de
//     midiasJson). Um membro autenticado poderia reescrever esse campo
//     no navegador. Por isso a URL de cada material passa pelo MESMO
//     validador já usado por favicon, logo e imagem do Hero
//     (validarUrlMidiaOrganizacao): mesma origem do bucket, prefixo da
//     própria organização, pasta certa e nome de arquivo no formato que
//     o servidor emite. Não dá pra apontar um "material" pra um domínio
//     externo nem pra um objeto de outro tenant, mesmo com o payload
//     adulterado.
//
//  2. O mimeType NUNCA vem do formulário — é derivado da extensão da URL
//     já validada, contra a mesma allowlist do upload. O que o cliente
//     declara sobre o próprio arquivo não interessa.

// Formatos aceitos. V1 é só PDF — é o formato em que book, planta e
// tabela de preços realmente circulam no mercado, e é o único que o
// upload aceita nesta pasta (ver upload-validation.ts, categoria
// "documento"). Executável, compactado, HTML e Office ficam de fora por
// não estarem aqui, não por bloqueio explícito.
export const EXTENSOES_MATERIAL: Record<string, string> = {
  pdf: "application/pdf",
};

// Teto por imóvel. Não é limite de plano (não existe feature de
// documento em PlanLimit, e inventar uma exigiria mexer no catálogo
// global de planos): é um limite de sanidade do formulário, aplicado no
// servidor, pra que a lista não vire um depósito.
export const MAX_MATERIAIS_POR_IMOVEL = 10;

const NOME_MAXIMO = 120;
const NOME_PADRAO = "Material de apresentação";

// Pasta do bucket onde os materiais são gravados (ver PASTAS_PERMITIDAS
// em upload-validation.ts).
export const PASTA_MATERIAIS = "materiais";

export type MaterialEntrada = {
  name: string;
  url: string;
  active: boolean;
};

export type MaterialParaGravar = {
  name: string;
  url: string;
  mimeType: string;
  sortOrder: number;
  active: boolean;
};

// Nome é texto livre digitado pelo corretor e aparece na ficha pública.
// React escapa o conteúdo na renderização, então o risco aqui não é HTML
// e sim caractere de controle e nome quilométrico. Controle e quebra de
// linha viram espaço; o excesso é cortado.
export function sanitizarNomeMaterial(valor: unknown): string {
  if (typeof valor !== "string") return NOME_PADRAO;
  const limpo = valor
    .replace(/[\x00-\x1f\x7f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NOME_MAXIMO);
  return limpo || NOME_PADRAO;
}

/**
 * A URL precisa ser, exatamente, um objeto DESTE bucket, DESTA
 * organização, na pasta de materiais, com nome de arquivo no formato que
 * o servidor emite. Devolve o mimeType derivado da extensão, ou null se
 * qualquer parte não bater.
 */
export function mimeDeMaterialValido(
  url: unknown,
  opcoes: { organizationId: string }
): string | null {
  if (typeof url !== "string" || !url) return null;

  const extensoes = Object.keys(EXTENSOES_MATERIAL);
  if (
    !validarUrlMidiaOrganizacao(url, opcoes.organizationId, PASTA_MATERIAIS, extensoes)
  ) {
    return null;
  }

  const extensao = url.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSOES_MATERIAL[extensao] ?? null;
}

/**
 * Converte o JSON do formulário na lista que vai pro banco. Entrada
 * inválida é DESCARTADA, nunca corrigida: um material com URL de outro
 * tenant, de domínio externo ou de formato não aceito simplesmente não
 * existe. A ordem é a posição na lista submetida — explícita, nunca
 * createdAt.
 */
export function parseMateriais(
  json: string | undefined | null,
  opcoes: { organizationId: string }
): MaterialParaGravar[] {
  if (!json) return [];

  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(bruto)) return [];

  const materiais: MaterialParaGravar[] = [];
  const urlsVistas = new Set<string>();

  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const candidato = item as Partial<MaterialEntrada>;
    const mimeType = mimeDeMaterialValido(candidato.url, opcoes);
    if (!mimeType) continue;
    const url = candidato.url as string;
    // O mesmo objeto duas vezes seria o mesmo arquivo listado duas vezes
    // na ficha pública.
    if (urlsVistas.has(url)) continue;
    urlsVistas.add(url);

    materiais.push({
      name: sanitizarNomeMaterial(candidato.name),
      url,
      mimeType,
      sortOrder: materiais.length,
      // Só `false` explícito desativa: material sem o campo é ativo.
      active: candidato.active !== false,
    });

    if (materiais.length >= MAX_MATERIAIS_POR_IMOVEL) break;
  }

  return materiais;
}

// O que a ficha pública exibe ANTES da captação: id e nome, nunca a URL.
export type MaterialListado = { id: string; name: string };

// O que a captação bem-sucedida devolve: aí sim com o arquivo.
export type MaterialPublico = MaterialListado & { url: string };

/**
 * O bloco público só existe quando há material ativo de verdade.
 *
 * `isLaunch` NÃO faz o bloco aparecer sozinho: um lançamento sem nenhum
 * arquivo cadastrado renderizaria um convite para receber algo que não
 * existe. A ficha já tem três CTAs de contato (card lateral, barra fixa
 * e modal da galeria), todos capturando com origem IMOVEL — um quarto
 * CTA prometendo material inexistente não acrescentaria captação, só
 * prometeria o que ninguém pode entregar. O que `isLaunch` decide é
 * APENAS a palavra do título (ver tituloDosMateriais).
 */
export function blocoDeMateriaisVisivel(materiaisAtivos: MaterialListado[]): boolean {
  return materiaisAtivos.length > 0;
}

export function tituloDosMateriais(isLaunch: boolean): string {
  return isLaunch
    ? "Quer receber os materiais deste empreendimento?"
    : "Quer receber os materiais deste imóvel?";
}

import { z } from "zod";

// =======================================================================
// O que tem por perto (Fase 42)
// =======================================================================
// Regras puras dos locais próximos: vocabulário, validação e formatação.
// Sem Prisma — este módulo atravessa para o formulário do imóvel, que é
// Client Component.
//
// Três invariantes, todas decididas aqui e em nenhum outro lugar:
//
//   1. DISTÂNCIA É OPCIONAL, E EM PAR. Número e unidade são null juntos
//      ou preenchidos juntos. Campo numérico vazio descarta a unidade que
//      estiver selecionada — a UI sempre tem uma unidade escolhida no
//      seletor, e guardá-la sozinha seria afirmar "km" de coisa nenhuma.
//   2. APAGAR A DISTÂNCIA NÃO APAGA O LOCAL. São ações diferentes, e a
//      normalização abaixo nunca transforma "sem distância" em "remover".
//   3. NUNCA HÁ PLACEHOLDER DE DISTÂNCIA. Sem número, a linha diz só a
//      categoria — nada de "—" ou "não informado".
// =======================================================================

export const CATEGORIAS_LOCAL = [
  "MARKET",
  "BAKERY",
  "PHARMACY",
  "HEALTH",
  "SCHOOL",
  "UNIVERSITY",
  "SUBWAY",
  "TRANSPORT",
  "PARK",
  "SHOPPING",
  "GYM",
  "RESTAURANT",
  "PET_SHOP",
  "OTHER",
] as const;

export type CategoriaLocal = (typeof CATEGORIAS_LOCAL)[number];

export const CATEGORIA_LOCAL_LABEL: Record<CategoriaLocal, string> = {
  MARKET: "Mercado",
  BAKERY: "Padaria",
  PHARMACY: "Farmácia",
  HEALTH: "Saúde",
  SCHOOL: "Escola",
  UNIVERSITY: "Faculdade",
  SUBWAY: "Metrô",
  TRANSPORT: "Transporte",
  PARK: "Parque",
  SHOPPING: "Shopping",
  GYM: "Academia",
  RESTAURANT: "Restaurante",
  PET_SHOP: "Pet shop",
  OTHER: "Outros",
};

export const UNIDADES_DISTANCIA = ["METERS", "KILOMETERS"] as const;
export type UnidadeDistancia = (typeof UNIDADES_DISTANCIA)[number];

export const UNIDADE_DISTANCIA_LABEL: Record<UnidadeDistancia, string> = {
  METERS: "m",
  KILOMETERS: "km",
};

/** Coleção pequena e editorial: o destaque da vizinhança, não um guia. */
export const LIMITE_LOCAIS_PROXIMOS = 20;
export const LIMITE_NOME_LOCAL = 80;
// Tetos de sanidade: um dígito a mais na digitação ("3500 km") não pode
// virar dado. Metros em inteiros (ninguém anuncia "350,5 m"); quilômetros
// com até duas casas ("1,25 km").
export const DISTANCIA_MAXIMA_METROS = 100_000;
export const DISTANCIA_MAXIMA_KM = 1_000;

/** Um local como circula entre formulário e servidor. */
export type LocalProximo = {
  /** Presente quando o local já existe no banco — é o que preserva a identidade ao editar. */
  id?: string;
  categoria: CategoriaLocal;
  nome: string;
  distancia: number | null;
  unidade: UnidadeDistancia | null;
};

// -----------------------------------------------------------------------
// Distância digitada
// -----------------------------------------------------------------------
export type DistanciaInterpretada =
  | { ok: true; distancia: number | null; unidade: UnidadeDistancia | null }
  | { ok: false; erro: string };

/**
 * O que o corretor digitou no campo de distância, com a unidade do
 * seletor ao lado.
 *
 * Aceita vírgula decimal ("1,2"), que é como se escreve em português.
 * Campo vazio devolve o PAR nulo — a unidade selecionada é descartada.
 */
export function interpretarDistancia(
  bruto: string | number | null | undefined,
  unidade: UnidadeDistancia
): DistanciaInterpretada {
  const texto = String(bruto ?? "").trim();
  if (!texto) return { ok: true, distancia: null, unidade: null };

  // Só dígitos com UM separador decimal opcional. "1.200" (milhar com
  // ponto) é recusado em vez de virar 1,2 em silêncio.
  if (!/^\d+([.,]\d+)?$/.test(texto)) {
    return { ok: false, erro: "Informe a distância só com números, ex.: 350 ou 1,2." };
  }
  const valor = Number(texto.replace(",", "."));
  if (!Number.isFinite(valor) || valor <= 0) {
    return { ok: false, erro: "A distância precisa ser maior que zero." };
  }

  if (unidade === "METERS") {
    if (!Number.isInteger(valor)) {
      return { ok: false, erro: "Em metros, use um número inteiro (ou troque para km)." };
    }
    if (valor > DISTANCIA_MAXIMA_METROS) {
      return { ok: false, erro: "Distância muito grande para metros — use km." };
    }
  } else {
    const casas = texto.includes(",") || texto.includes(".") ? texto.split(/[.,]/)[1].length : 0;
    if (casas > 2) return { ok: false, erro: "Use no máximo duas casas decimais em km." };
    if (valor > DISTANCIA_MAXIMA_KM) {
      return { ok: false, erro: "Distância acima do limite permitido." };
    }
  }
  return { ok: true, distancia: valor, unidade };
}

// -----------------------------------------------------------------------
// Validação da coleção (servidor)
// -----------------------------------------------------------------------
const localSchema = z
  .object({
    id: z.string().min(1).optional(),
    categoria: z.enum(CATEGORIAS_LOCAL),
    nome: z
      .string()
      .trim()
      .min(1, "Informe o nome do local.")
      .max(LIMITE_NOME_LOCAL, `O nome do local deve ter no máximo ${LIMITE_NOME_LOCAL} caracteres.`),
    distancia: z.number().positive().nullable(),
    unidade: z.enum(UNIDADES_DISTANCIA).nullable(),
  })
  // A invariante do par, no servidor: o formulário já a respeita, mas um
  // POST direto não passa pelo formulário.
  .refine((l) => (l.distancia === null) === (l.unidade === null), {
    message: "Distância e unidade devem ser informadas juntas.",
  })
  .refine(
    (l) =>
      l.distancia === null ||
      (l.unidade === "METERS"
        ? Number.isInteger(l.distancia) && l.distancia <= DISTANCIA_MAXIMA_METROS
        : l.distancia <= DISTANCIA_MAXIMA_KM &&
          // Tolerância: 1.15 * 100 é 114.99999999999999 em ponto flutuante.
          Math.abs(Math.round(l.distancia * 100) - l.distancia * 100) < 1e-6),
    { message: "Distância inválida." }
  );

const colecaoSchema = z
  .array(localSchema)
  .max(LIMITE_LOCAIS_PROXIMOS, `Cadastre no máximo ${LIMITE_LOCAIS_PROXIMOS} locais.`);

export type LocaisInterpretados =
  | { ok: true; locais: LocalProximo[] }
  | { ok: false; erro: string };

/**
 * A lista completa que o formulário serializou.
 *
 * Ausente = lista vazia (imóvel sem locais é o estado normal). JSON
 * malformado ou item inválido RECUSA a coleção inteira: gravar metade do
 * que o corretor montou seria pior que pedir para corrigir.
 */
export function interpretarLocaisProximos(json: string | null | undefined): LocaisInterpretados {
  if (!json || !json.trim()) return { ok: true, locais: [] };
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { ok: false, erro: "Não foi possível ler os locais próximos. Recarregue a página." };
  }
  const r = colecaoSchema.safeParse(bruto);
  if (!r.success) {
    return { ok: false, erro: r.error.issues[0]?.message ?? "Locais próximos inválidos." };
  }
  return { ok: true, locais: r.data };
}

// -----------------------------------------------------------------------
// Exibição
// -----------------------------------------------------------------------
/** "350 m", "1,2 km" — ou null quando não há distância (nunca um traço). */
export function formatarDistancia(
  distancia: number | null,
  unidade: UnidadeDistancia | null
): string | null {
  if (distancia === null || unidade === null) return null;
  const numero = distancia.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${numero} ${UNIDADE_DISTANCIA_LABEL[unidade]}`;
}

/** "Farmácia · 350 m" — ou só "Parque" quando não há distância. */
export function resumoDoLocal(local: Pick<LocalProximo, "categoria" | "distancia" | "unidade">): string {
  const distancia = formatarDistancia(local.distancia, local.unidade);
  const categoria = CATEGORIA_LOCAL_LABEL[local.categoria];
  return distancia ? `${categoria} · ${distancia}` : categoria;
}

/** Valor que o campo de edição mostra: "1,2" para 1.2 km, "" sem distância. */
export function distanciaParaCampo(distancia: number | null): string {
  if (distancia === null) return "";
  return String(distancia).replace(".", ",");
}

// -----------------------------------------------------------------------
// Escrita
// -----------------------------------------------------------------------
/** Colunas de um local. A ORDEM é a posição na lista que o corretor montou. */
export function colunasDoLocal(local: LocalProximo, ordem: number) {
  return {
    category: local.categoria,
    name: local.nome,
    distance: local.distancia,
    distanceUnit: local.unidade,
    order: ordem,
  };
}

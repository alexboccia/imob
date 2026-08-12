import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { normalizarTexto } from "@/lib/texto";
import type { PropertyInterestStage } from "@/generated/prisma/client";

// =====================================================================
// Fase E do CRM — matching determinístico Person↔Property. Sem IA, sem
// embeddings, sem ML: um algoritmo explícito, auditável e testável sem
// banco (calcularCompatibilidade é pura).
// =====================================================================

const TOP_N_PADRAO = 5;
// Isolado e nomeado de propósito (decisão da Fase E) — ajustar aqui não
// exige tocar no algoritmo.
export const SCORE_MINIMO_RECOMENDACAO = 50;

// Pesos aprovados (Fase E). Soma conceitual = 100, mas o score real usa
// denominador dinâmico (ver calcularCompatibilidade) — a soma dos pesos
// só bate 100 quando TODOS os critérios estão ativos ao mesmo tempo.
//
// Localização (25) é dividida em duas metades iguais (12.5 cada) para
// city e neighborhood, tratadas como dois critérios independentes que já
// seguem a mesma regra geral de "inativo não entra no denominador" — não
// precisa de nenhuma lógica especial de divisão: se só cities estiver
// preenchido, neighborhood fica inativo (fora do denominador) e city
// sozinho responde pelos 12.5 pontos ativos de localização daquele
// resultado, nunca artificialmente zerado. Ver testes AM/AN/AO.
const PESOS = {
  city: 12.5,
  neighborhood: 12.5,
  bedrooms: 15,
  bathrooms: 10,
  parkingSpots: 10,
  area: 15,
  propertyFeatures: 15,
  condoFeatures: 10,
} as const;

export type CriterioMatchKey =
  | "purpose"
  | "price"
  | "type"
  | "city"
  | "neighborhood"
  | "bedrooms"
  | "bathrooms"
  | "parkingSpots"
  | "area"
  | "propertyFeatures"
  | "condoFeatures";

const CRITERIO_LABEL: Record<CriterioMatchKey, string> = {
  purpose: "Finalidade",
  price: "Preço",
  type: "Tipo de imóvel",
  city: "Cidade",
  neighborhood: "Bairro",
  bedrooms: "Quartos",
  bathrooms: "Banheiros",
  parkingSpots: "Vagas",
  area: "Área",
  propertyFeatures: "Características do imóvel",
  condoFeatures: "Características do condomínio",
};

export type CriterioMatch = {
  key: CriterioMatchKey;
  label: string;
  // false = critério não avaliado (preferência não informada OU, pra
  // critérios que dependem de um campo do Property, esse campo é NULL).
  // Nunca vira 0 silenciosamente — fica fora do score inteiramente.
  active: boolean;
  // 0 a 1 (proporção atendida) — null quando active=false. Critérios
  // booleanos (tudo exceto features) só assumem 0 ou 1.
  percentualAtendido: number | null;
  // Derivado de percentualAtendido > 0 — usado pela UI pro ✓/✕. Para
  // features com match parcial, ainda é true (qualquer sobreposição é um
  // sinal positivo, mesmo que não seja 100%).
  matched: boolean | null;
  // Peso usado no cálculo do score. 0 para hard filters (purpose/price/
  // type) — eles nunca inflam o percentual, só aparecem no array pra a
  // UI poder explicar o resultado.
  weight: number;
  detail?: string;
};

export type MatchingResult = {
  property: PropertyParaMatching;
  // false quando algum HARD FILTER (purpose/price/type) não passou —
  // nesse caso score é sempre 0. Na prática, buscarImoveisCompativeis já
  // filtra isso via SQL antes de chegar aqui; calcularCompatibilidade
  // reavalia de forma independente pra ser testável sozinha, sem
  // depender de o pré-filtro ter sido feito corretamente por fora.
  compatible: boolean;
  // 0-100, arredondado. Só SOFT CRITERIA contribuem (hard filters têm
  // weight=0, nunca inflam o percentual).
  score: number;
  // Quantos soft criteria (weight>0) entraram no denominador do score.
  // Existe pra UI decidir se pode mostrar "score%" com segurança — quando
  // é 0 (só hard filters/nenhuma preferência soft informada), o score
  // interno vira 100 por convenção (ver calcularScore), mas isso não é
  // "100% compatível" de verdade: é ausência de sinal negativo, não a
  // confirmação de nenhum critério. A UI não deve exibir percentual nesse
  // caso (ver RecomendacaoImovelItem).
  activeSoftCriteriaCount: number;
  criteria: CriterioMatch[];
};

export type PreferenciaParaMatching = {
  transactionType: "SALE" | "RENT" | "SALE_AND_RENT" | null;
  propertyTypes: string[];
  cities: string[];
  neighborhoods: string[];
  minPrice: unknown;
  maxPrice: unknown;
  minBedrooms: number | null;
  minBathrooms: number | null;
  minParkingSpots: number | null;
  minArea: number | null;
  maxArea: number | null;
  desiredPropertyFeatures: string[];
  desiredCondoFeatures: string[];
};

export type PropertyParaMatching = {
  id: string;
  title: string;
  type: string;
  purpose: "SALE" | "RENT" | "SALE_AND_RENT";
  city: string;
  neighborhood: string;
  price: unknown;
  rentPrice: unknown;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  privateArea: number | null;
  propertyFeatures: string[];
  condoFeatures: string[];
  updatedAt: Date;
};

// Mesmo padrão de conversão de Decimal/unknown já usado em
// formatarPreco (src/lib/format.ts) — nunca presume que o valor já é
// number (Prisma devolve Decimal, não number puro).
function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor.toString());
  return Number.isNaN(numero) ? null : numero;
}

function normalizarComparavel(valor: string): string {
  return normalizarTexto(valor.trim());
}

function criterioBooleano(
  key: CriterioMatchKey,
  weight: number,
  active: boolean,
  atendeu: boolean,
  detail?: string
): CriterioMatch {
  return {
    key,
    label: CRITERIO_LABEL[key],
    active,
    percentualAtendido: active ? (atendeu ? 1 : 0) : null,
    matched: active ? atendeu : null,
    weight,
    detail,
  };
}

function criterioInativo(key: CriterioMatchKey, weight: number): CriterioMatch {
  return {
    key,
    label: CRITERIO_LABEL[key],
    active: false,
    percentualAtendido: null,
    matched: null,
    weight,
  };
}

// Função pura — nunca acessa banco, sessão, environment ou API. Testável
// isoladamente com objetos simples, sem fixtures/DB.
export function calcularCompatibilidade(
  preference: PreferenciaParaMatching,
  property: PropertyParaMatching
): MatchingResult {
  const criteria: CriterioMatch[] = [];

  // --- HARD FILTERS (weight: 0 — nunca contribuem pro score) ---

  let hardFiltersOk = true;

  if (preference.transactionType) {
    const purposesCompativeis =
      preference.transactionType === "SALE"
        ? ["SALE", "SALE_AND_RENT"]
        : preference.transactionType === "RENT"
          ? ["RENT", "SALE_AND_RENT"]
          : ["SALE", "RENT", "SALE_AND_RENT"];
    const atendeu = purposesCompativeis.includes(property.purpose);
    if (!atendeu) hardFiltersOk = false;
    criteria.push(criterioBooleano("purpose", 0, true, atendeu, property.purpose));
  } else {
    criteria.push(criterioInativo("purpose", 0));
  }

  if (preference.propertyTypes.length > 0) {
    const atendeu = preference.propertyTypes.includes(property.type);
    if (!atendeu) hardFiltersOk = false;
    criteria.push(criterioBooleano("type", 0, true, atendeu, property.type));
  } else {
    criteria.push(criterioInativo("type", 0));
  }

  const minPrice = paraNumero(preference.minPrice);
  const maxPrice = preference.maxPrice != null ? paraNumero(preference.maxPrice) : null;
  const precoAtivo =
    preference.transactionType != null && (minPrice != null || maxPrice != null);
  if (precoAtivo) {
    const precoImovel =
      preference.transactionType === "SALE" ? paraNumero(property.price) : paraNumero(property.rentPrice);
    // Preço é HARD FILTER — diferente de quartos/banheiros/área (soft),
    // se o dado do imóvel pro tipo de transação pedido está ausente, não
    // dá pra confirmar que está dentro do orçamento, então NÃO passa
    // (nunca tratado como neutro/ignorado, ao contrário dos soft
    // criteria — essa é a diferença deliberada entre os dois grupos).
    const atendeu =
      precoImovel != null &&
      (minPrice == null || precoImovel >= minPrice) &&
      (maxPrice == null || precoImovel <= maxPrice);
    if (!atendeu) hardFiltersOk = false;
    criteria.push(
      criterioBooleano(
        "price",
        0,
        true,
        atendeu,
        precoImovel != null ? `R$ ${precoImovel.toLocaleString("pt-BR")}` : "Preço não informado"
      )
    );
  } else {
    criteria.push(criterioInativo("price", 0));
  }

  // --- SOFT CRITERIA (contribuem pro score, nunca eliminam) ---

  if (preference.cities.length > 0) {
    const cidadesNormalizadas = preference.cities.map(normalizarComparavel);
    const atendeu = cidadesNormalizadas.includes(normalizarComparavel(property.city));
    criteria.push(criterioBooleano("city", PESOS.city, true, atendeu, property.city));
  } else {
    criteria.push(criterioInativo("city", PESOS.city));
  }

  if (preference.neighborhoods.length > 0) {
    const bairrosNormalizados = preference.neighborhoods.map(normalizarComparavel);
    const atendeu = bairrosNormalizados.includes(normalizarComparavel(property.neighborhood));
    criteria.push(
      criterioBooleano("neighborhood", PESOS.neighborhood, true, atendeu, property.neighborhood)
    );
  } else {
    criteria.push(criterioInativo("neighborhood", PESOS.neighborhood));
  }

  criteria.push(
    criterioNumericoMinimo("bedrooms", PESOS.bedrooms, preference.minBedrooms, property.bedrooms)
  );
  criteria.push(
    criterioNumericoMinimo("bathrooms", PESOS.bathrooms, preference.minBathrooms, property.bathrooms)
  );
  criteria.push(
    criterioNumericoMinimo(
      "parkingSpots",
      PESOS.parkingSpots,
      preference.minParkingSpots,
      property.parkingSpots
    )
  );

  const areaAtiva =
    (preference.minArea != null || preference.maxArea != null) && property.privateArea != null;
  if (areaAtiva) {
    const atendeu =
      (preference.minArea == null || property.privateArea! >= preference.minArea) &&
      (preference.maxArea == null || property.privateArea! <= preference.maxArea);
    criteria.push(
      criterioBooleano("area", PESOS.area, true, atendeu, `${property.privateArea} m²`)
    );
  } else {
    criteria.push(criterioInativo("area", PESOS.area));
  }

  criteria.push(
    criterioFeatures(
      "propertyFeatures",
      PESOS.propertyFeatures,
      preference.desiredPropertyFeatures,
      property.propertyFeatures
    )
  );
  criteria.push(
    criterioFeatures(
      "condoFeatures",
      PESOS.condoFeatures,
      preference.desiredCondoFeatures,
      property.condoFeatures
    )
  );

  const score = hardFiltersOk ? calcularScore(criteria) : 0;
  const activeSoftCriteriaCount = criteria.filter((c) => c.active && c.weight > 0).length;

  return {
    property,
    compatible: hardFiltersOk,
    score,
    activeSoftCriteriaCount,
    criteria,
  };
}

function criterioNumericoMinimo(
  key: "bedrooms" | "bathrooms" | "parkingSpots",
  weight: number,
  minimo: number | null,
  valorImovel: number | null
): CriterioMatch {
  const active = minimo != null && valorImovel != null;
  if (!active) return criterioInativo(key, weight);
  const atendeu = valorImovel! >= minimo!;
  return criterioBooleano(key, weight, true, atendeu, `${valorImovel}`);
}

function criterioFeatures(
  key: "propertyFeatures" | "condoFeatures",
  weight: number,
  desejadas: string[],
  presentes: string[]
): CriterioMatch {
  if (desejadas.length === 0) return criterioInativo(key, weight);
  const encontradas = desejadas.filter((f) => presentes.includes(f));
  const percentualAtendido = encontradas.length / desejadas.length;
  return {
    key,
    label: CRITERIO_LABEL[key],
    active: true,
    percentualAtendido,
    matched: percentualAtendido > 0,
    weight,
    detail: `${encontradas.length} de ${desejadas.length} características desejadas`,
  };
}

// Soma ponderada só dos critérios ativos (denominador dinâmico — Fase E,
// decisão #6). Hard filters nunca entram aqui (weight sempre 0 pra eles).
// Quando não existe NENHUM soft criterion ativo (caso raro: preferência
// só tem transactionType/propertyTypes/preço preenchidos, nada mais),
// não há nada pra desconfiar do imóvel além dos hard filters já
// confirmados — score = 100 nesse caso específico (decisão documentada,
// ver testes). Isso não é "inventar número": é a ausência total de sinal
// negativo, não um placeholder arbitrário.
function calcularScore(criteria: CriterioMatch[]): number {
  const ativos = criteria.filter((c) => c.active && c.weight > 0);
  if (ativos.length === 0) return 100;

  const pesoTotal = ativos.reduce((soma, c) => soma + c.weight, 0);
  const pesoAtendido = ativos.reduce((soma, c) => soma + c.weight * (c.percentualAtendido ?? 0), 0);

  return Math.round((100 * pesoAtendido) / pesoTotal);
}

// ---------------------------------------------------------------------
// Orquestração (Prisma + tenant-scoping + entitlement). Separada da
// função pura acima de propósito — calcularCompatibilidade não sabe (e
// não precisa saber) que Prisma, sessão ou organizationId existem.
// ---------------------------------------------------------------------

export type ResultadoMatching = MatchingResult & {
  existingInterest: { id: string; stage: PropertyInterestStage; favorited: boolean } | null;
};

export async function buscarImoveisCompativeis(
  organizationId: string,
  personId: string,
  opcoes: { limite?: number } = {}
): Promise<ResultadoMatching[]> {
  const limite = opcoes.limite ?? TOP_N_PADRAO;

  // Matching pertence ao CRM — mesmo módulo já usado por toda a ficha do
  // cliente. Checado aqui também (não só na página) como defesa em
  // profundidade, mesmo racional de nunca depender de uma única camada.
  if (!(await hasModule(organizationId, "crm"))) return [];

  return withOrganization(organizationId, async () => {
    // Person validada por id + organizationId antes de qualquer outra
    // coisa — personId é input do navegador como qualquer outro (rota
    // dinâmica /app/clientes/[id]).
    const pessoa = await prisma.person.findUnique({
      where: { id: personId, organizationId },
      select: { id: true },
    });
    if (!pessoa) return [];

    // PersonPreference busca pelo par (personId, organizationId) — só
    // pode corresponder à Person já validada acima, nunca a de outro
    // tenant.
    const preferencia = await prisma.personPreference.findUnique({
      where: { personId, organizationId },
    });
    if (!preferencia) return [];

    // ETAPA 1 — pré-filtro no Postgres: só HARD FILTERS. Soft criteria
    // (quartos/banheiros/vagas/área) de propósito NÃO entram aqui — um
    // gte/lte no SQL excluiria silenciosamente Property com o campo
    // NULL, o que contradiz a regra de "NULL fica neutro" (soft). Nada
    // de `take` aqui: o corte de quantidade só acontece depois do score
    // calculado (Fase E, decisão #10) — aplicar limite antes descartaria
    // candidatos potencialmente melhores antes de avaliá-los.
    const candidatos = await prisma.property.findMany({
      where: {
        organizationId,
        status: "AVAILABLE",
        ...(preferencia.transactionType && {
          purpose:
            preferencia.transactionType === "SALE"
              ? { in: ["SALE", "SALE_AND_RENT"] }
              : { in: ["RENT", "SALE_AND_RENT"] },
        }),
        ...(preferencia.propertyTypes.length > 0 && { type: { in: preferencia.propertyTypes } }),
        ...(preferencia.transactionType === "SALE" &&
          (preferencia.minPrice != null || preferencia.maxPrice != null) && {
            price: {
              ...(preferencia.minPrice != null && { gte: preferencia.minPrice }),
              ...(preferencia.maxPrice != null && { lte: preferencia.maxPrice }),
            },
          }),
        ...(preferencia.transactionType === "RENT" &&
          (preferencia.minPrice != null || preferencia.maxPrice != null) && {
            rentPrice: {
              ...(preferencia.minPrice != null && { gte: preferencia.minPrice }),
              ...(preferencia.maxPrice != null && { lte: preferencia.maxPrice }),
            },
          }),
      },
    });

    if (candidatos.length === 0) return [];

    // PropertyInterest existente pros candidatos — sempre escopado por
    // organizationId + personId explícitos, nunca confiando só no
    // propertyId estar na lista de candidatos (que já é da mesma org,
    // mas defesa em profundidade não custa nada aqui).
    const interesses = await prisma.propertyInterest.findMany({
      where: { organizationId, personId, propertyId: { in: candidatos.map((c) => c.id) } },
      select: { id: true, propertyId: true, stage: true, favorited: true },
    });
    const interesseMap = new Map(interesses.map((i) => [i.propertyId, i]));

    // ETAPA 2 — score em TypeScript, só sobre o conjunto já pré-filtrado.
    const resultados: ResultadoMatching[] = candidatos
      .map((property) => {
        const matching = calcularCompatibilidade(preferencia, property);
        const interesse = interesseMap.get(property.id);
        return {
          ...matching,
          existingInterest: interesse
            ? { id: interesse.id, stage: interesse.stage, favorited: interesse.favorited }
            : null,
        };
      })
      .filter((r) => r.compatible && r.score >= SCORE_MINIMO_RECOMENDACAO)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const diffUpdated = b.property.updatedAt.getTime() - a.property.updatedAt.getTime();
        if (diffUpdated !== 0) return diffUpdated;
        return a.property.id < b.property.id ? -1 : a.property.id > b.property.id ? 1 : 0;
      });

    return resultados.slice(0, limite);
  });
}

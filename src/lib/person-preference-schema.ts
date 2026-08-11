import { z } from "zod";
import { erroValidacao, type ActionState } from "@/lib/action-result";

// Mesmo preprocess de src/lib/property-mapper.ts (imovelSchema) — string
// vazia vira undefined em vez de NaN, número comum coage normalmente.
// Reaproveitado em vez de duplicado. Usado só pra preço/área — aceita
// decimal de propósito.
const numeroOpcional = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().optional()
);

// Mesmo preprocess acima, mas com .int() — quartos/banheiros/vagas nunca
// podem ser fracionários. Sem isso, um valor como "2.5" passava no Zod e
// o Postgres truncava silenciosamente pra "2" (confirmado empiricamente
// na auditoria da Fase C) — corrupção de dado silenciosa, não um erro
// visível. Com .int() aqui, "2.5" é rejeitado ANTES de chegar no Prisma.
const numeroInteiroOpcional = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().int({ message: "Deve ser um número inteiro." }).optional()
);

// Limites defensivos (não representam regra comercial — ver Fase C,
// decisão #4): nenhum campo de texto livre/array do projeto tinha
// precedente de limite antes desta feature.
function arrayDeTags(max: number) {
  return z.array(z.string().trim().min(1)).max(max).default([]);
}

// Mesmo que arrayDeTags, mas deduplicando por valor normalizado (trim +
// lowercase) — "Moema", " moema " e "MOEMA" contam como a mesma tag.
// Mantém a apresentação da PRIMEIRA ocorrência (nunca força lowercase no
// dado gravado — só a comparação é normalizada, ver Fase C, decisão #3).
// max() é aplicado DEPOIS da deduplicação: o limite é sobre preferências
// distintas, não sobre quantas vezes o formulário repetiu a mesma tag.
function arrayDeTagsUnicas(max: number, mensagemLimite: string) {
  return z
    .array(z.string().trim().min(1))
    .default([])
    .transform((valores) => {
      const vistos = new Set<string>();
      const resultado: string[] = [];
      for (const valor of valores) {
        const chave = valor.toLowerCase();
        if (!vistos.has(chave)) {
          vistos.add(chave);
          resultado.push(valor);
        }
      }
      return resultado;
    })
    .refine((valores) => valores.length <= max, { message: mensagemLimite });
}

export const personPreferenceSchema = z
  .object({
    // "" quando o <Select> não tem nada escolhido — vira undefined antes
    // do enum, que só aceita SALE/RENT (SALE_AND_RENT existe em
    // PropertyPurpose por causa de Property, mas não é uma opção válida
    // de preferência de busca — ver schema.prisma, comentário do campo).
    transactionType: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(["SALE", "RENT"]).optional()
    ),
    propertyTypes: arrayDeTags(20),
    cities: arrayDeTagsUnicas(20, "Máximo de 20 cidades."),
    neighborhoods: arrayDeTagsUnicas(30, "Máximo de 30 bairros."),
    minPrice: numeroOpcional,
    maxPrice: numeroOpcional,
    minBedrooms: numeroInteiroOpcional,
    minBathrooms: numeroInteiroOpcional,
    minParkingSpots: numeroInteiroOpcional,
    minArea: numeroOpcional,
    maxArea: numeroOpcional,
    desiredPropertyFeatures: arrayDeTags(50),
    desiredCondoFeatures: arrayDeTags(50),
    notes: z
      .string()
      .trim()
      .max(2000, "Observações muito longas (máximo 2.000 caracteres).")
      .optional()
      .or(z.literal("")),
  })
  .refine((d) => d.minPrice == null || d.minPrice >= 0, {
    message: "Preço mínimo não pode ser negativo.",
    path: ["minPrice"],
  })
  .refine((d) => d.maxPrice == null || d.maxPrice >= 0, {
    message: "Preço máximo não pode ser negativo.",
    path: ["maxPrice"],
  })
  .refine((d) => d.minPrice == null || d.maxPrice == null || d.minPrice <= d.maxPrice, {
    message: "Preço mínimo não pode ser maior que o máximo.",
    path: ["minPrice"],
  })
  .refine((d) => d.minArea == null || d.minArea >= 0, {
    message: "Área mínima não pode ser negativa.",
    path: ["minArea"],
  })
  .refine((d) => d.maxArea == null || d.maxArea >= 0, {
    message: "Área máxima não pode ser negativa.",
    path: ["maxArea"],
  })
  .refine((d) => d.minArea == null || d.maxArea == null || d.minArea <= d.maxArea, {
    message: "Área mínima não pode ser maior que a máxima.",
    path: ["minArea"],
  })
  .refine((d) => d.minBedrooms == null || d.minBedrooms >= 0, {
    message: "Quartos não pode ser negativo.",
    path: ["minBedrooms"],
  })
  .refine((d) => d.minBathrooms == null || d.minBathrooms >= 0, {
    message: "Banheiros não pode ser negativo.",
    path: ["minBathrooms"],
  })
  .refine((d) => d.minParkingSpots == null || d.minParkingSpots >= 0, {
    message: "Vagas não pode ser negativo.",
    path: ["minParkingSpots"],
  });

export type DadosPreferenciaFormulario = z.infer<typeof personPreferenceSchema>;

// Único ponto de leitura + validação do FormData da preferência — arrays
// (propertyTypes/cities/neighborhoods/desiredPropertyFeatures/
// desiredCondoFeatures) chegam via formData.getAll (múltiplos valores sob
// o mesmo name, mesmo padrão de SeletorCaracteristicas/checkboxes),
// nunca de Object.fromEntries (que só pegaria o último valor de cada
// chave repetida).
export function parsePersonPreferenceFormData(
  formData: FormData
): { ok: true; dados: DadosPreferenciaFormulario } | { ok: false; estado: ActionState } {
  const bruto = {
    ...Object.fromEntries(formData.entries()),
    propertyTypes: formData.getAll("propertyTypes").map(String),
    cities: formData.getAll("cities").map(String),
    neighborhoods: formData.getAll("neighborhoods").map(String),
    desiredPropertyFeatures: formData.getAll("desiredPropertyFeatures").map(String),
    desiredCondoFeatures: formData.getAll("desiredCondoFeatures").map(String),
  };
  const parsed = personPreferenceSchema.safeParse(bruto);
  if (!parsed.success) {
    return { ok: false, estado: erroValidacao(parsed.error) };
  }
  return { ok: true, dados: parsed.data };
}

// Mapeamento único "dados validados" -> "campos do Prisma" — organizationId
// e personId ficam de fora de propósito (montados por quem chama, nunca a
// partir do formulário).
export function camposPreferencia(dados: DadosPreferenciaFormulario) {
  return {
    transactionType: dados.transactionType ?? null,
    propertyTypes: dados.propertyTypes,
    cities: dados.cities,
    neighborhoods: dados.neighborhoods,
    minPrice: dados.minPrice ?? null,
    maxPrice: dados.maxPrice ?? null,
    minBedrooms: dados.minBedrooms ?? null,
    minBathrooms: dados.minBathrooms ?? null,
    minParkingSpots: dados.minParkingSpots ?? null,
    minArea: dados.minArea ?? null,
    maxArea: dados.maxArea ?? null,
    desiredPropertyFeatures: dados.desiredPropertyFeatures,
    desiredCondoFeatures: dados.desiredCondoFeatures,
    notes: dados.notes || null,
  };
}

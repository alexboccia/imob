import { z } from "zod";
import { erroValidacao, type ActionState } from "@/lib/action-result";

const numeroOpcional = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().optional()
);

const booleanCheckbox = z.preprocess((v) => v === "on", z.boolean());

export const imovelSchema = z.object({
  titulo: z.string().min(3, "Informe um título com ao menos 3 caracteres."),
  descricao: z.string().optional(),
  tipo: z.string().min(1, "Selecione o tipo do imóvel."),
  finalidade: z.enum(["SALE", "RENT", "SALE_AND_RENT"]),
  status: z.enum([
    "DRAFT",
    "AVAILABLE",
    "RESERVED",
    "SOLD",
    "RENTED",
    "INACTIVE",
  ]),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().min(1, "Informe o bairro."),
  cidade: z.string().min(1, "Informe a cidade."),
  estado: z
    .string()
    .min(2, "Informe a UF do estado.")
    .max(2, "Use a sigla do estado (UF)."),
  latitude: numeroOpcional,
  longitude: numeroOpcional,
  preco: numeroOpcional,
  precoAluguel: numeroOpcional,
  precoCondominio: numeroOpcional,
  precoIptu: numeroOpcional,
  areaTotal: numeroOpcional,
  areaPrivativa: numeroOpcional,
  quartos: numeroOpcional,
  suites: numeroOpcional,
  banheiros: numeroOpcional,
  vagasGaragem: numeroOpcional,
  lancamento: booleanCheckbox,
  destaque: booleanCheckbox,
  oportunidade: booleanCheckbox,
  slideshow: booleanCheckbox,
  estagioObra: z
    .enum(["PRE_CONSTRUCTION", "UNDER_CONSTRUCTION", "READY_TO_MOVE"])
    .optional()
    .or(z.literal("")),
  previsaoEntrega: z.string().optional(),
  construtora: z.string().optional(),
  midiasJson: z.string().optional(),
});

export type DadosImovelFormulario = z.infer<typeof imovelSchema> & {
  caracteristicasImovel: string[];
  caracteristicasCondominio: string[];
};

// Único ponto de leitura + validação do FormData do imóvel — usado por
// criarImovel e atualizarImovel, para que os dois nunca divirjam sobre quais
// campos existem ou como são validados.
export function parseImovelFormData(
  formData: FormData
):
  | { ok: true; dados: DadosImovelFormulario }
  | { ok: false; estado: ActionState } {
  const bruto = Object.fromEntries(formData.entries());
  const parsed = imovelSchema.safeParse(bruto);
  if (!parsed.success) {
    return { ok: false, estado: erroValidacao(parsed.error) };
  }
  return {
    ok: true,
    dados: {
      ...parsed.data,
      caracteristicasImovel: formData.getAll("caracteristicasImovel").map(String),
      caracteristicasCondominio: formData
        .getAll("caracteristicasCondominio")
        .map(String),
    },
  };
}

function parseMesAno(valor: string | undefined): Date | null {
  if (!valor) return null;
  const [ano, mes] = valor.split("-").map(Number);
  if (!ano || !mes) return null;
  return new Date(Date.UTC(ano, mes - 1, 1));
}

// Mapeamento único de "dados do formulário" -> "campos do Prisma", usado
// tanto por criarImovel quanto por atualizarImovel. Campos que só fazem
// sentido em um dos dois fluxos (organizationId, responsibleMemberId,
// publishedAt, statusHistory, media) ficam de fora de propósito e são
// montados por quem chama — o objetivo aqui é só garantir que os campos que
// as duas operações têm em comum nunca fiquem fora de sincronia.
export function camposImovel(dados: DadosImovelFormulario) {
  return {
    title: dados.titulo,
    description: dados.descricao || null,
    type: dados.tipo,
    purpose: dados.finalidade,
    status: dados.status,
    zipCode: dados.cep || null,
    street: dados.logradouro || null,
    number: dados.numero || null,
    complement: dados.complemento || null,
    neighborhood: dados.bairro,
    city: dados.cidade,
    state: dados.estado.toUpperCase(),
    latitude: dados.latitude ?? null,
    longitude: dados.longitude ?? null,
    price: dados.preco ?? null,
    rentPrice: dados.precoAluguel ?? null,
    condoFee: dados.precoCondominio ?? null,
    propertyTax: dados.precoIptu ?? null,
    totalArea: dados.areaTotal ?? null,
    privateArea: dados.areaPrivativa ?? null,
    bedrooms: dados.quartos ?? null,
    suites: dados.suites ?? null,
    bathrooms: dados.banheiros ?? null,
    parkingSpots: dados.vagasGaragem ?? null,
    propertyFeatures: dados.caracteristicasImovel,
    condoFeatures: dados.caracteristicasCondominio,
    isLaunch: dados.lancamento,
    isFeatured: dados.destaque,
    isOpportunity: dados.oportunidade,
    hasSlideshow: dados.slideshow,
    constructionStage: dados.estagioObra || null,
    deliveryForecast: parseMesAno(dados.previsaoEntrega),
    developer: dados.construtora || null,
  };
}

const TIPO_MIDIA_PARA_MEDIA_TYPE = {
  FOTO: "PHOTO",
  VIDEO: "VIDEO",
  PLANTA: "FLOOR_PLAN",
} as const;

export type MidiaParaCriar = {
  type: "PHOTO" | "VIDEO" | "FLOOR_PLAN";
  url: string;
  isCover: boolean;
  order: number;
};

export function parseMidias(json: string | undefined): MidiaParaCriar[] {
  if (!json) return [];
  try {
    const midias = JSON.parse(json) as {
      tipo: "FOTO" | "VIDEO" | "PLANTA";
      url: string;
      ehCapa: boolean;
    }[];
    return midias.map((m, i) => ({
      type: TIPO_MIDIA_PARA_MEDIA_TYPE[m.tipo],
      url: m.url,
      isCover: m.ehCapa,
      order: i,
    }));
  } catch {
    return [];
  }
}

export function midiasParaCriar(midias: MidiaParaCriar[], organizationId: string) {
  return midias.map((m) => ({ ...m, organizationId }));
}

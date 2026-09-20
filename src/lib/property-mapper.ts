import { z } from "zod";
import { erroValidacao, type ActionState } from "@/lib/action-result";
import { urlTourSegura } from "@/lib/recursos-imovel";

const numeroOpcional = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().optional()
);

const booleanCheckbox = z.preprocess((v) => v === "on", z.boolean());

// Fase 40 — teto da frase de destaque.
//
// 180 caracteres: é uma FRASE, não um parágrafo. O limite existe para
// proteger o desenho (o bloco cresce em duas ou três linhas, nunca vira
// um segundo texto) e para manter a promessa do campo — quem precisa de
// mais espaço tem a descrição logo acima.
//
// Exportado porque o formulário usa o mesmo número no maxLength do
// campo: um limite escrito em dois lugares diverge na primeira mudança.
export const LIMITE_FRASE_DESTAQUE = 180;

// Fase 45 — conteúdo editorial da galeria. Mesma lógica da frase: são
// textos curtos que vivem SOBRE uma foto, e o limite protege a foto.
// Fase 54 — observação editorial sobre o VALOR, logo abaixo do preço.
// 160 caracteres, o mesmo teto do subtítulo do destaque: é uma linha
// colada no preço ("Previsão de valorização: +25% até a entrega"), não
// um parágrafo de condições comerciais. Quem precisa de mais espaço tem
// a descrição e a frase de destaque.
export const LIMITE_OBSERVACAO_VALOR = 160;

export const LIMITE_TITULO_DESTAQUE = 80;
export const LIMITE_SUBTITULO_DESTAQUE = 160;
export const LIMITE_LEGENDA_FOTO = 80;

/**
 * Legenda de uma foto como será gravada: texto de uma linha, sem espaços
 * nas pontas nem quebras internas. Vazio (ou só espaços) vira null — as
 * duas formas significariam "sem legenda".
 */
export function normalizarLegenda(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const texto = bruto.replace(/\s+/g, " ").trim();
  return texto || null;
}

function textoDeUmaLinha(valor: unknown) {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : valor;
}

type ItemMidiaBruto = {
  tipo?: unknown;
  url?: unknown;
  ehCapa?: unknown;
  legenda?: unknown;
};

function lerMidiasBrutas(json: string | undefined): ItemMidiaBruto[] {
  if (!json) return [];
  try {
    const lista = JSON.parse(json);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export const imovelSchema = z.object({
  titulo: z.string().min(3, "Informe um título com ao menos 3 caracteres."),
  descricao: z.string().optional(),
  // A validação de tamanho roda sobre o texto JÁ SEM espaços nas pontas:
  // 180 espaços seguidos de uma palavra não são uma frase de 181
  // caracteres. O `.trim()` do zod transforma antes do `.max()`.
  //
  // Server-side de verdade: o maxLength do navegador é conveniência, e
  // um POST direto ignora HTML. Esta é a regra que vale.
  fraseDestaque: z
    .string()
    .trim()
    .max(
      LIMITE_FRASE_DESTAQUE,
      `A frase de destaque deve ter no máximo ${LIMITE_FRASE_DESTAQUE} caracteres.`
    )
    .optional(),
  tipo: z.string().min(1, "Selecione o tipo do imóvel."),
  // Fase 38 — ID do empreendimento ao qual esta unidade pertence.
  // Opcional: "sem empreendimento" é o estado de toda Property anterior
  // à fase e continua sendo uma escolha legítima.
  //
  // NÃO entra em camposImovel() de propósito: o valor precisa ser
  // validado contra a organização antes de ser gravado, e o mapper é
  // puro (não conhece tenant nem banco). Quem valida são as actions.
  empreendimentoId: z.string().optional(),
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
  // Fase 54 — uma linha de texto puro: quebras e espaços repetidos viram
  // um espaço ANTES do limite, e o trim acontece antes do .max() (160
  // espaços seguidos de uma palavra não são uma observação de 161
  // caracteres). Server-side de verdade: o maxLength do navegador é
  // conveniência, um POST direto ignora HTML.
  observacaoValor: z.preprocess(
    textoDeUmaLinha,
    z
      .string()
      .max(
        LIMITE_OBSERVACAO_VALOR,
        `A observação sobre o valor deve ter no máximo ${LIMITE_OBSERVACAO_VALOR} caracteres.`
      )
      .optional()
  ),
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
  // Fase 45 — título e subtítulo da foto de destaque. Mesma regra da
  // frase: trim antes do limite, vazio vira null em camposImovel.
  // Uma linha de texto puro: quebras e espaços repetidos viram um espaço
  // ANTES do limite — o layout decide onde quebrar, não o cadastro.
  tituloDestaque: z.preprocess(
    textoDeUmaLinha,
    z
      .string()
      .max(
        LIMITE_TITULO_DESTAQUE,
        `O título do destaque deve ter no máximo ${LIMITE_TITULO_DESTAQUE} caracteres.`
      )
      .optional()
  ),
  subtituloDestaque: z.preprocess(
    textoDeUmaLinha,
    z
      .string()
      .max(
        LIMITE_SUBTITULO_DESTAQUE,
        `O subtítulo do destaque deve ter no máximo ${LIMITE_SUBTITULO_DESTAQUE} caracteres.`
      )
      .optional()
  ),
  // Fase 45 — a legenda de cada foto viaja DENTRO do item da mídia (o
  // mesmo objeto que carrega a url), então acompanha a foto em qualquer
  // reordenação ou troca de capa. O limite é validado aqui, no servidor:
  // uma legenda longa demais recusa o salvamento em vez de ser cortada.
  midiasJson: z
    .string()
    .optional()
    .superRefine((json, ctx) => {
      const longa = lerMidiasBrutas(json).some((m) => {
        const legenda = normalizarLegenda(m.legenda);
        return m.tipo === "FOTO" && legenda !== null && legenda.length > LIMITE_LEGENDA_FOTO;
      });
      if (longa) {
        ctx.addIssue({
          code: "custom",
          message: `Cada legenda de foto deve ter no máximo ${LIMITE_LEGENDA_FOTO} caracteres.`,
        });
      }
    }),
  // Fase 42 — a lista COMPLETA de locais próximos, como o formulário a
  // montou. Validada item a item em locais-proximos.ts.
  locaisProximosJson: z.string().optional(),
  // Lista de materiais de apresentação, mesmo padrão de midiasJson. O
  // conteúdo é validado em materiais-imovel.ts (URL do próprio bucket e
  // do próprio tenant) — aqui só se garante que é texto.
  materiaisJson: z.string().optional(),
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

// "YYYY-MM" do <input type="month"> -> Date em UTC no dia 1. UTC é
// obrigatório aqui: com Date(ano, mes-1, 1) local, um fuso negativo
// grava o mês anterior às 21h e "Junho/2027" volta como Maio/2027 na
// leitura. Quem lê usa getUTC* pelo mesmo motivo (ver
// SecaoLancamentoFields e imovel-lancamento.ts).
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
    // Fase 54 — vazio (ou só espaços, já removidos pelo preprocess) vira
    // NULL: é o que permite LIMPAR a observação pelo próprio formulário,
    // e o que faz a ficha pública não reservar espaço nenhum.
    priceNote: dados.observacaoValor || null,
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
    // trim: é o único campo de texto livre desta seção. Sem ele, um
    // valor só com espaços era gravado como "   " — truthy no site
    // público, virando "Construtora:   " no cabeçalho do imóvel.
    developer: dados.construtora?.trim() || null,
    // Vazio (ou só espaços, já removidos pelo schema) vira NULL, nunca
    // string vazia: os dois significariam "sem frase", e guardar as duas
    // formas tornaria a condição de renderização ambígua. É também o que
    // permite LIMPAR a frase pelo próprio formulário.
    highlightPhrase: dados.fraseDestaque || null,
    // Fase 45 — vazio (ou só espaços, já removidos pelo schema) = NULL:
    // é o que permite limpar o título/subtítulo pelo próprio formulário.
    heroTitle: dados.tituloDestaque || null,
    heroSubtitle: dados.subtituloDestaque || null,
  };
}

const TIPO_MIDIA_PARA_MEDIA_TYPE = {
  FOTO: "PHOTO",
  VIDEO: "VIDEO",
  PLANTA: "FLOOR_PLAN",
  TOUR: "VIRTUAL_TOUR",
} as const;

export type MidiaParaCriar = {
  type: "PHOTO" | "VIDEO" | "FLOOR_PLAN" | "VIRTUAL_TOUR";
  url: string;
  isCover: boolean;
  order: number;
  caption: string | null;
};

export function parseMidias(json: string | undefined): MidiaParaCriar[] {
  if (!json) return [];
  try {
    const midias = JSON.parse(json) as {
      tipo: "FOTO" | "VIDEO" | "PLANTA" | "TOUR";
      url: string;
      ehCapa: boolean;
      legenda?: unknown;
    }[];
    return midias
      // Fase 39 — TOUR com endereço inseguro é DESCARTADO na escrita,
      // além da guarda que a leitura pública já aplica. O href de um
      // link aceita javascript:, e nenhuma das duas pontas deve confiar
      // na outra.
      .filter((m) => m.tipo !== "TOUR" || urlTourSegura(m.url) !== null)
      // Só os campos listados aqui chegam ao banco: um `id`,
      // `organizationId` ou `propertyId` injetado no JSON é ignorado.
      .map((m, i) => ({
      type: TIPO_MIDIA_PARA_MEDIA_TYPE[m.tipo],
      url: m.url,
      isCover: m.ehCapa,
      order: i,
      // Fase 45 — legenda é só de foto; nos demais tipos, nada é gravado.
      caption: m.tipo === "FOTO" ? normalizarLegenda(m.legenda) : null,
    }));
  } catch {
    return [];
  }
}

export function midiasParaCriar(midias: MidiaParaCriar[], organizationId: string) {
  return midias.map((m) => ({ ...m, organizationId }));
}

import { z } from "zod";

// Fase P.9 — parsing/validação puros (sem Prisma) do formulário de edição
// de Plan em /platform/plans/[id]/editar. `code`/`id`/`createdAt` nunca
// aparecem aqui — são intocáveis por design (ver
// platform/plans/[id]/actions.ts).

// Converte um valor de reais digitado pra centavos inteiros, sem passar
// por float em nenhum momento (evita 99.99*100 = 9998.999999... de ponto
// flutuante). Formato SEMPRE pt-BR, igual ao resto da exibição de dinheiro
// no projeto (toLocaleString("pt-BR")): vírgula é o separador decimal,
// ponto é separador de milhar — nunca o contrário ("99.90" é 9990 reais,
// não R$99,90; use vírgula pra centavos). null = valor vazio (plano sem
// preço definido, mesma semântica já usada hoje pra priceMonthlyCents
// nullable). Rejeita qualquer formato não numérico — nunca "tenta
// adivinhar".
export function centavosDeReais(valorDigitado: string): number | null {
  const valor = valorDigitado.trim();
  if (valor === "") return null;

  const normalizado = valor.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;

  const [reaisStr, centavosStr = ""] = normalizado.split(".");
  const centavosPadded = (centavosStr + "00").slice(0, 2);
  return Number(reaisStr) * 100 + Number(centavosPadded);
}

export function reaisDeCentavos(centavos: number | null): string {
  if (centavos === null) return "";
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "" (campo vazio) = ilimitado (null). Qualquer outra coisa precisa ser
// inteiro >= 0 — nunca negativo, nunca decimal.
export function parseLimiteForm(valorDigitado: string): { ok: true; valor: number | null } | { ok: false } {
  const valor = valorDigitado.trim();
  if (valor === "") return { ok: true, valor: null };
  if (!/^\d+$/.test(valor)) return { ok: false };
  return { ok: true, valor: Number(valor) };
}

export const FEATURES_EDITAVEIS_PLANO = ["PROPERTIES", "PHOTOS_PER_PROPERTY", "USERS", "CRM_CLIENTS"] as const;

// Código técnico do plano (Plan.code) — mesma convenção dos 4 planos que
// já existem (STARTER/BASICO/PRO/PREMIUM): letras maiúsculas e
// underscore, nunca espaço/acento/minúscula. Só é pedido na CRIAÇÃO —
// na edição, code é intocável por design (ver actions.ts).
export const codigoPlanoSchema = z
  .string()
  .trim()
  .min(2, "Informe um código.")
  .max(30, "Código muito longo.")
  .regex(/^[A-Z][A-Z0-9_]*$/, "Use apenas letras maiúsculas, números e underscore (ex: ENTERPRISE).");

const CAMPOS_COMUNS = {
  name: z.string().trim().min(2, "Informe o nome do plano."),
  descriptionRaw: z.string().optional().default(""),
  priceMonthlyCentsRaw: z.string(),
  isTrial: z.enum(["true", "false"]),
  trialDaysRaw: z.string().optional().default(""),
  PROPERTIES: z.string(),
  PHOTOS_PER_PROPERTY: z.string(),
  USERS: z.string(),
  CRM_CLIENTS: z.string(),
};

type CamposComuns = {
  name: string;
  descriptionRaw: string;
  priceMonthlyCentsRaw: string;
  isTrial: "true" | "false";
  trialDaysRaw: string;
  PROPERTIES: string;
  PHOTOS_PER_PROPERTY: string;
  USERS: string;
  CRM_CLIENTS: string;
};

// Núcleo compartilhado por criarPlanoSchema e editarPlanoSchema: preço,
// trial e os 4 limites têm exatamente a mesma validação nos dois
// formulários — só o que envolve `code`/`active` (criação vs. edição)
// diverge, e cada schema trata isso por conta própria.
function validarNucleoPlano(dados: CamposComuns, ctx: z.RefinementCtx) {
  const priceMonthlyCents = centavosDeReais(dados.priceMonthlyCentsRaw);
  if (dados.priceMonthlyCentsRaw.trim() !== "" && priceMonthlyCents === null) {
    ctx.addIssue({ code: "custom", path: ["priceMonthlyCentsRaw"], message: "Preço inválido." });
    return null;
  }
  if (priceMonthlyCents !== null && priceMonthlyCents < 0) {
    ctx.addIssue({ code: "custom", path: ["priceMonthlyCentsRaw"], message: "Preço não pode ser negativo." });
    return null;
  }

  const isTrial = dados.isTrial === "true";
  let trialDays: number | null = null;
  if (isTrial) {
    const parsedTrial = parseLimiteForm(dados.trialDaysRaw);
    if (!parsedTrial.ok || parsedTrial.valor === null || parsedTrial.valor <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["trialDaysRaw"],
        message: "Informe um número de dias de trial maior que zero.",
      });
      return null;
    }
    trialDays = parsedTrial.valor;
  }

  const limites: Record<(typeof FEATURES_EDITAVEIS_PLANO)[number], number | null> = {
    PROPERTIES: 0,
    PHOTOS_PER_PROPERTY: 0,
    USERS: 0,
    CRM_CLIENTS: 0,
  };
  for (const feature of FEATURES_EDITAVEIS_PLANO) {
    const parsed = parseLimiteForm(dados[feature]);
    if (!parsed.ok) {
      ctx.addIssue({
        code: "custom",
        path: [feature],
        message: "Informe um número inteiro >= 0, ou deixe vazio para ilimitado.",
      });
      return null;
    }
    limites[feature] = parsed.valor;
  }

  const description = dados.descriptionRaw.trim();

  return {
    name: dados.name,
    description: description === "" ? null : description,
    priceMonthlyCents,
    isTrial,
    trialDays,
    limites,
  };
}

export const editarPlanoSchema = z
  .object({ ...CAMPOS_COMUNS, active: z.enum(["true", "false"]) })
  .transform((dados, ctx) => {
    const nucleo = validarNucleoPlano(dados, ctx);
    if (!nucleo) return z.NEVER;
    return { ...nucleo, active: dados.active === "true" };
  });

// Criação — mesmo núcleo de editarPlanoSchema, mais o code (intocável
// depois de criado). active sempre começa true: um plano recém-criado
// sem organização nenhuma não tem nada a proteger ao ficar ativo.
export const criarPlanoSchema = z
  .object({ ...CAMPOS_COMUNS, code: codigoPlanoSchema })
  .transform((dados, ctx) => {
    const nucleo = validarNucleoPlano(dados, ctx);
    if (!nucleo) return z.NEVER;
    return { ...nucleo, code: dados.code };
  });

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

export const editarPlanoSchema = z
  .object({
    priceMonthlyCentsRaw: z.string(),
    isTrial: z.enum(["true", "false"]),
    trialDaysRaw: z.string().optional().default(""),
    active: z.enum(["true", "false"]),
    PROPERTIES: z.string(),
    PHOTOS_PER_PROPERTY: z.string(),
    USERS: z.string(),
    CRM_CLIENTS: z.string(),
  })
  .transform((dados, ctx) => {
    const priceMonthlyCents = centavosDeReais(dados.priceMonthlyCentsRaw);
    if (dados.priceMonthlyCentsRaw.trim() !== "" && priceMonthlyCents === null) {
      ctx.addIssue({ code: "custom", path: ["priceMonthlyCentsRaw"], message: "Preço inválido." });
      return z.NEVER;
    }
    if (priceMonthlyCents !== null && priceMonthlyCents < 0) {
      ctx.addIssue({ code: "custom", path: ["priceMonthlyCentsRaw"], message: "Preço não pode ser negativo." });
      return z.NEVER;
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
        return z.NEVER;
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
        ctx.addIssue({ code: "custom", path: [feature], message: "Informe um número inteiro >= 0, ou deixe vazio para ilimitado." });
        return z.NEVER;
      }
      limites[feature] = parsed.valor;
    }

    return {
      priceMonthlyCents,
      isTrial,
      trialDays,
      active: dados.active === "true",
      limites,
    };
  });

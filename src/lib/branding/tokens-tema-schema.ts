import { z } from "zod";
import { parseOklchSeguro } from "@/lib/branding/oklch-color";
import type { TokensTema } from "@/lib/branding/temas";

// Validação estrutural do JSON persistido em
// OrganizationBranding.customTheme — exatamente as 7 chaves de TokensTema
// (mesmo shape do catálogo fixo, ver temas.ts), cada uma uma string no
// formato oklch(L C H) (ver parseOklchSeguro). `.strict()` recusa
// qualquer chave extra. Este é o ÚNICO ponto que decide se um JSON vira
// CSS de verdade no site — nada com formato livre passa daqui pra frente,
// nem o que o próprio servidor acabou de gerar (defesa em profundidade,
// mesmo racional de favicon-url.ts: nunca confiar só em quem gravou).
const corOklchSchema = z.string().refine((v) => parseOklchSeguro(v) !== null, {
  message: "Cor fora do formato oklch(L C H) esperado.",
});

export const tokensTemaSchema = z
  .object({
    primary: corOklchSchema,
    primaryHover: corOklchSchema,
    primaryLight: corOklchSchema,
    onPrimary: corOklchSchema,
    secondary: corOklchSchema,
    border: corOklchSchema,
    link: corOklchSchema,
  })
  .strict();

// Converte um valor `unknown` (Prisma Json não é tipado em compile-time,
// e pode ter sido adulterado fora da aplicação) num TokensTema confiável.
// null em qualquer formato inválido — nunca lança, quem chama trata como
// "sem tema customizado disponível" e cai no fallback de sempre (ver
// resolverTemaEfetivo em temas.ts).
export function parseTokensTemaSeguro(valor: unknown): TokensTema | null {
  const resultado = tokensTemaSchema.safeParse(valor);
  return resultado.success ? resultado.data : null;
}

import { z } from "zod";

// Mesmos 5 valores de PropertyInterestStage (prisma/schema.prisma) — repetido
// aqui em vez de importado do client gerado porque este arquivo precisa ser
// importável sem puxar o Prisma Client inteiro (mesmo racional de
// person-preference-schema.ts, testável isoladamente).
export const ESTAGIOS_INTERESSE = [
  "INTERESTED",
  "VISIT_SCHEDULED",
  "VISITED",
  "PROPOSAL",
  "REJECTED",
] as const;

// Limite defensivo — mesmo valor já usado em PersonPreference.notes (Fase C),
// sem precedente de um número "oficial" no projeto além desse.
const notesSchema = z
  .string()
  .trim()
  .max(2000, "Observações muito longas (máximo 2.000 caracteres).")
  .optional()
  .or(z.literal(""));

export const criarInteresseSchema = z.object({
  propertyId: z.string().min(1, "Selecione o imóvel."),
  notes: notesSchema,
});

export const atualizarEstagioInteresseSchema = z.object({
  stage: z.enum(ESTAGIOS_INTERESSE),
  notes: notesSchema,
});

export type DadosCriarInteresse = z.infer<typeof criarInteresseSchema>;
export type DadosAtualizarEstagioInteresse = z.infer<typeof atualizarEstagioInteresseSchema>;

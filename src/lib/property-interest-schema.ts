import { z } from "zod";

// Valores de PropertyInterestStage alcançáveis pela action MANUAL e
// genérica atualizarEstagioInteresse — repetido aqui em vez de importado do
// client gerado porque este arquivo precisa ser importável sem puxar o
// Prisma Client inteiro (mesmo racional de person-preference-schema.ts,
// testável isoladamente).
//
// WON (Fase P.2) é DELIBERADAMENTE OMITIDO desta lista — o enum real no
// banco já tem 6 valores, mas esta action genérica não deve ser capaz de
// marcar uma negociação como ganha sem passar pela futura action dedicada
// da P.3 (que precisará preencher closedAt atomicamente junto do stage).
// Esta omissão é a defesa real (o Zod rejeita "WON" no FormData mesmo que
// alguém adultere o Select no browser) — não é só a UI escondendo a opção.
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

import { z } from "zod";

// Mesmo limite/racional de notesSchema em property-interest-schema.ts —
// sem precedente de outro número "oficial" no projeto. Exportado (H.6)
// porque atualizarObservacaoAgendamentoVisitaSchema, abaixo, reusa a
// mesma regra — nunca uma segunda validação de "notes" divergente.
export const notesSchema = z
  .string()
  .trim()
  .max(2000, "Observações muito longas (máximo 2.000 caracteres).")
  .optional()
  .or(z.literal(""));

// Formato do <input type="datetime-local">: "YYYY-MM-DDTHH:mm", sem
// timezone. A validação de forma (regex) só garante que o valor é
// parseável por parseScheduledAt abaixo — a validação de "não pode ser no
// passado" é feita nas Server Actions (depende de Date.now() no momento da
// chamada, não é responsabilidade de um schema Zod estático).
const scheduledAtInputSchema = z
  .string()
  .min(1, "Informe a data e o horário da visita.")
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Data/horário inválidos.");

export const criarAgendamentoVisitaSchema = z.object({
  scheduledAt: scheduledAtInputSchema,
  notes: notesSchema,
});

export const remarcarAgendamentoVisitaSchema = z.object({
  scheduledAt: scheduledAtInputSchema,
});

// Observação do agendamento (Fase H.6) — só o campo `notes`, reaproveita
// a MESMA validação usada em criarAgendamentoVisitaSchema (trim, máximo
// 2.000, "" tratado como ausente). Quem chama (Server Action) converte
// undefined/"" pra null antes de persistir — o schema em si não decide
// isso, só valida forma.
export const atualizarObservacaoAgendamentoVisitaSchema = z.object({
  notes: notesSchema,
});

export type DadosCriarAgendamentoVisita = z.infer<typeof criarAgendamentoVisitaSchema>;
export type DadosRemarcarAgendamentoVisita = z.infer<typeof remarcarAgendamentoVisitaSchema>;
export type DadosAtualizarObservacaoAgendamentoVisita = z.infer<
  typeof atualizarObservacaoAgendamentoVisitaSchema
>;

// Converte o valor de um <input type="datetime-local"> num Date real.
//
// Decisão de produto da Fase H.2 (documentada porque não há precedente no
// schema): datetime-local não carrega timezone, e Organization não tem
// timezone configurado nesta fase (deliberadamente fora de escopo — ver
// AGENTS.md da H.2, não deve ser inventado no schema.prisma agora). Em vez
// de `new Date(valor)` puro — que o motor JS resolveria como horário LOCAL
// do PROCESSO Node, ambíguo entre dev (tipicamente America/Sao_Paulo) e
// produção (contêiner, tipicamente UTC) — o valor é interpretado como UTC
// de forma explícita e determinística, sempre com o mesmo resultado
// independente de onde o código roda. Mesmo racional de parseMesAno em
// src/lib/property-mapper.ts (Date.UTC explícito, nunca parsing ambíguo de
// string). Se uma Organization ganhar timezone configurável no futuro,
// este é o único ponto que precisa mudar.
export function parseScheduledAt(valor: string): Date {
  const [dataParte, horaParte] = valor.split("T");
  const [ano, mes, dia] = dataParte.split("-").map(Number);
  const [horas, minutos] = horaParte.split(":").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, horas, minutos));
}

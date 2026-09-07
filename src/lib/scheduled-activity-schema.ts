import { z } from "zod";
import { LIMITE_ASSUNTO_FOLLOW_UP } from "@/lib/follow-up";

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

// ---------- Follow-up comercial (Fase 19) ----------
//
// `subject` é o COMPROMISSO em si ("Enviar proposta revisada") e é
// OBRIGATÓRIO para FOLLOW_UP — um follow-up sem assunto não responde
// "o quê?", que é metade da razão de ele existir. trim antes de tudo:
// só espaços é ausência, nunca um assunto válido de 3 caracteres em
// branco.
export const assuntoFollowUpSchema = z
  .string()
  .trim()
  .min(1, "Descreva a ação (ex: enviar proposta revisada).")
  .max(
    LIMITE_ASSUNTO_FOLLOW_UP,
    `Descrição muito longa (máximo ${LIMITE_ASSUNTO_FOLLOW_UP} caracteres).`
  );

export const criarFollowUpSchema = z.object({
  subject: assuntoFollowUpSchema,
  scheduledAt: scheduledAtInputSchema,
  // Observação continua sendo o campo da H.6: contexto complementar,
  // nunca o compromisso.
  notes: notesSchema,
});

// Edição: os três campos juntos, no mesmo formulário. Diferente da
// visita, que só permite remarcar a data (o "assunto" de uma visita é
// visitar o imóvel, não há texto a corrigir).
export const atualizarFollowUpSchema = z.object({
  subject: assuntoFollowUpSchema,
  scheduledAt: scheduledAtInputSchema,
  notes: notesSchema,
});

export type DadosCriarFollowUp = z.infer<typeof criarFollowUpSchema>;
export type DadosAtualizarFollowUp = z.infer<typeof atualizarFollowUpSchema>;

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

// A conversão datetime-local -> instante mora em
// src/lib/fuso-horario.ts (deDatetimeLocalNoFuso) desde a Fase 18.
//
// Até a Fase 17 o parse acontecia aqui e interpretava o valor como UTC
// literal, porque Organization não tinha fuso configurável — o que fazia
// "14:30" digitado por uma imobiliária de São Paulo virar 11:30 local no
// banco. A resposta para "14:30 em qual fuso?" agora é: no fuso da
// ORGANIZAÇÃO, resolvido pela Server Action, nunca o do processo Node e
// nunca o do navegador de quem preencheu o formulário.


import { z } from "zod";
import { telefoneValido } from "@/lib/telefone";

// =======================================================================
// Solicitação de visita pela ficha pública (Fase 55)
// =======================================================================
// O domínio de visita já existe inteiro (ScheduledActivity type VISIT) e
// trabalha com INSTANTE exato, no fuso da organização. Este schema só
// valida a FORMA do que o visitante digitou; quem transforma data + hora
// em instante é a action, com o fuso da organização (deDatetimeLocalNoFuso).
//
// Dois campos separados (data e hora) em vez de um datetime-local: no
// celular o seletor nativo de cada um é muito melhor, e a junção é
// trivial. O formato de cada um é o mesmo que o painel já usa.
//
// Nome, telefone E e-mail são obrigatórios aqui — diferente do formulário
// de contato, onde e-mail e telefone são opcionais. Quem marca visita
// está combinando hora e lugar com uma pessoa: sem um jeito de confirmar,
// a visita não é agendável, e prometer o contrário seria mentira.

/** "YYYY-MM-DD" — a data desejada, no calendário da organização. */
const DATA = /^\d{4}-\d{2}-\d{2}$/;
/** "HH:mm" — horário exato, a mesma granularidade do painel. */
const HORA = /^\d{2}:\d{2}$/;

export const LIMITE_OBSERVACAO_VISITA = 500;

export const visitaPublicaSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().email("E-mail inválido."),
  telefone: z.string().trim().refine(telefoneValido, "Telefone inválido."),
  data: z.string().regex(DATA, "Escolha uma data."),
  hora: z.string().regex(HORA, "Escolha um horário."),
  observacao: z
    .string()
    .trim()
    .max(LIMITE_OBSERVACAO_VISITA, `A observação deve ter no máximo ${LIMITE_OBSERVACAO_VISITA} caracteres.`)
    .optional(),
  imovelId: z.string().min(1),
});

export type VisitaPublica = z.infer<typeof visitaPublicaSchema>;

/** "YYYY-MM-DD" + "HH:mm" -> "YYYY-MM-DDTHH:mm", a forma que o fuso lê. */
export function comoDatetimeLocal(data: string, hora: string): string {
  return `${data}T${hora}`;
}

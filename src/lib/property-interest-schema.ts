import { z } from "zod";

// Valores de PropertyInterestStage alcançáveis pela action MANUAL e
// genérica atualizarEstagioInteresse — repetido aqui em vez de importado do
// client gerado porque este arquivo precisa ser importável sem puxar o
// Prisma Client inteiro (mesmo racional de person-preference-schema.ts,
// testável isoladamente).
//
// WON (Fase P.2) e REJECTED (Fase P.3) são DELIBERADAMENTE OMITIDOS desta
// lista — o enum real no banco tem 6 valores, mas esta action genérica não
// deve ser capaz de encerrar uma negociação (ganha OU perdida) sem passar
// pelas actions dedicadas de fechamento (marcarInteresseComoGanho/
// marcarInteresseComoPerdido, em clientes/actions.ts), que preenchem
// closedAt atomicamente junto do stage. Esta omissão é a defesa real (o Zod
// rejeita "WON"/"REJECTED" no FormData mesmo que alguém adultere o Select
// no browser) — não é só a UI escondendo a opção.
//
// Segundo papel desta mesma lista (Fase P.3): é também o conjunto de
// stages "abertos" a partir dos quais um fechamento (ganho ou perdido) é
// permitido — reaproveitada como guard atômico em
// marcarInteresseComoGanho/Perdido, única fonte de verdade em vez de uma
// segunda constante paralela que poderia divergir desta.
export const ESTAGIOS_INTERESSE = [
  "INTERESTED",
  "VISIT_SCHEDULED",
  "VISITED",
  "PROPOSAL",
] as const;

// WON e REJECTED são os dois únicos stages terminais (Fase P.2/P.3) —
// helper puro único usado tanto pela UI (gate do form genérico de
// stage/notes, botão "Agendar visita") quanto por qualquer lugar que
// precise da mesma checagem sem duplicar a comparação por extenso.
export function estagioInteresseEncerrado(stage: string): boolean {
  return stage === "WON" || stage === "REJECTED";
}

// Label de APRESENTAÇÃO (badges/histórico, sempre somente leitura) —
// inclui WON e REJECTED de propósito, mesmo os dois nunca aparecendo como
// opção no Select (ver ESTAGIOS_INTERESSE acima). As duas nunca devem ser
// fundidas de volta numa só constante.
//
// Movida de InteresseImovelItem.tsx pra cá na Fase P.4 (achado corrigido,
// não redesenho): definida num arquivo "use client", ESTAGIO_INTERESSE_LABEL
// só resolvia corretamente DENTRO do próprio InteresseImovelItem.tsx —
// qualquer outro consumidor (Server Component como imoveis/[id]/page.tsx,
// ou até outro Client Component como RecomendacaoImovelItem.tsx) recebia
// `undefined` de volta e caía no fallback `?? stage`, mostrando o enum
// bruto ("INTERESTED") em vez do rótulo. Um módulo plano (sem "use
// client"), como este arquivo já era pra ESTAGIOS_INTERESSE/
// estagioInteresseEncerrado, é a forma correta de compartilhar uma
// constante entre Server e Client Components neste projeto.
export const ESTAGIO_INTERESSE_LABEL: Record<string, string> = {
  INTERESTED: "Interessado",
  VISIT_SCHEDULED: "Visita agendada",
  VISITED: "Visitado",
  PROPOSAL: "Proposta",
  REJECTED: "Perdido",
  WON: "Ganho",
};

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

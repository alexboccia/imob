import type { ScheduledActivityType } from "@/generated/prisma/client";

// =======================================================================
// Follow-up comercial (Fase 19)
// =======================================================================
// PLANEJADO ≠ REALIZADO.
//
// Um follow-up é um COMPROMISSO que o corretor registrou explicitamente:
// "enviar a proposta revisada amanhã às 14h". Ele não é uma sugestão, não
// é um score, não é uma tarefa genérica e não afirma nada sobre o que
// aconteceu — concluir um follow-up prova apenas que alguém o marcou como
// concluído, jamais que a ligação foi feita ou a mensagem enviada.
//
// -----------------------------------------------------------------------
// POR QUE ScheduledActivity, E NÃO UM MODEL NOVO
// -----------------------------------------------------------------------
// A auditoria confirmou a classificação (A): ScheduledActivity já é uma
// entidade genérica de compromisso comercial cujo único tipo até aqui era
// VISIT. Evidências, não impressão:
//   - `type ScheduledActivityType @default(VISIT)` existe desde a H.1;
//   - os quatro índices são type-agnósticos, inclusive
//     (organizationId, status, scheduledAt), que é o padrão exato de
//     hoje/atrasadas/próximas;
//   - `propertyId`/`propertyInterestId` são nullable no schema e só
//     obrigatórios em REGRA DE APLICAÇÃO para VISIT — a própria H.2
//     documenta isso;
//   - o cabeçalho de agendamentos/actions.ts registra que outros tipos
//     ficaram "fora de escopo, sem alterar o enum".
// Criar um segundo model seria criar uma segunda agenda, com dois
// conceitos de "atrasado" para manter em sincronia.
//
// -----------------------------------------------------------------------
// O NOME NA TELA
// -----------------------------------------------------------------------
// "Próxima ação" JÁ É UM TERMO OCUPADO no produto: a Fase G tem
// src/lib/proxima-acao-comercial.ts, uma orientação DERIVADA do stage,
// sem data e sem persistência, exibida na ficha do cliente, na ficha do
// imóvel, nos cards de matching e no drawer do Pipeline. Reusar o nome
// colocaria dois conceitos diferentes com o mesmo rótulo na mesma tela.
// Por isso a superfície nova se chama FOLLOW-UP, e os dois coexistem.
// =======================================================================

export const TIPO_ATIVIDADE_LABEL: Record<ScheduledActivityType, string> = {
  VISIT: "Visita",
  FOLLOW_UP: "Follow-up",
};

// Limite do assunto. Não é número inventado: é o mesmo teto de 120 que o
// projeto já usa para texto curto de uma linha (nomePublico em
// configuracoes/actions.ts). `notes` continua com 2.000 — são campos de
// natureza diferente, e é por isso que os limites divergem.
export const LIMITE_ASSUNTO_FOLLOW_UP = 120;

// trim sempre; string vazia (ou só espaços) NUNCA vira `""` no banco.
// Devolve null para quem chama decidir se ausência é erro (FOLLOW_UP) ou
// estado legítimo (VISIT).
export function normalizarAssunto(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

// -----------------------------------------------------------------------
// O que CONCLUIR significa, por tipo
// -----------------------------------------------------------------------
// Função pura e explícita justamente porque este é o ponto onde a
// generalização poderia causar a regressão mais cara do produto: aplicar
// a semântica de visita a um follow-up criaria uma Interaction VISIT
// falsa e moveria o stage de uma negociação sem que visita nenhuma
// tivesse acontecido.
//
// VISIT (comportamento histórico da H.2, preservado intacto):
//   - marca a atividade como COMPLETED;
//   - cria Interaction VISIT (a visita ocorreu — é um fato comercial);
//   - avança VISIT_SCHEDULED -> VISITED, com StageHistory e ator.
//
// FOLLOW_UP:
//   - marca a atividade como COMPLETED. Só isso.
//   - NÃO cria Interaction: não sabemos o que de fato aconteceu. Se a
//     ligação foi feita, o corretor registra a interação — que é um
//     fluxo que já existe na ficha do cliente.
//   - NÃO move stage: concluir "cobrar documentos" não é uma visita
//     realizada nem uma proposta aceita.
export type EfeitosConclusao = {
  criaInteracaoVisita: boolean;
  avancaStageParaVisitado: boolean;
};

export function efeitosDaConclusao(tipo: ScheduledActivityType): EfeitosConclusao {
  return tipo === "VISIT"
    ? { criaInteracaoVisita: true, avancaStageParaVisitado: true }
    : { criaInteracaoVisita: false, avancaStageParaVisitado: false };
}

// -----------------------------------------------------------------------
// De quem é o follow-up
// -----------------------------------------------------------------------
// Do RESPONSÁVEL PELA NEGOCIAÇÃO (PropertyInterest.responsibleMemberId,
// Fase 11) — nunca de createdByMemberId, que a Fase 14 fixou como "quem
// criou", e criar não é ser dono.
//
// Consequência DELIBERADA, não acidente: ao transferir a negociação de
// Ana para Bruno, os follow-ups futuros passam a aparecer na Central de
// Bruno, porque o compromisso pertence à negociação e não a uma pessoa.
// É o comportamento correto — quem assume a negociação assume o trabalho
// pendente dela. Nenhum `assignedMemberId` foi criado na atividade: não
// há evidência de domínio de que executor e responsável divirjam, e
// inventar o campo criaria um terceiro conceito de dono.
//
// Por isso FOLLOW_UP exige propertyInterestId: sem negociação não há
// responsável objetivo. `Person.assignedMemberId` NÃO é usado como
// substituto — é a propriedade do CLIENTE, outra dimensão (Fase 11).
export const FOLLOW_UP_EXIGE_NEGOCIACAO = true;

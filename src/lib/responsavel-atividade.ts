import type { Prisma } from "@/generated/prisma/client";

// =======================================================================
// De quem é um compromisso — a regra, num lugar só
// =======================================================================
// ScheduledActivity responde a DUAS perguntas diferentes, e confundi-las
// foi o defeito que esta fase corrige:
//
//   QUEM CRIOU?            createdByMemberId   (autoria)
//   QUEM VAI EXECUTAR?     esta regra aqui     (posse)
//
// A posse tem PRECEDÊNCIA, e ela é soberana:
//
//   1. com negociação  -> PropertyInterest.responsibleMemberId
//   2. sem negociação  -> ScheduledActivity.responsibleMemberId
//
// Até a Fase 32 só existia o caso 1, e por isso um compromisso sem
// negociação não tinha dono objetivo: ele existia no banco e não
// aparecia na Central pessoal de ninguém. O caso 2 fecha essa lacuna sem
// abrir uma segunda fonte de verdade — repare que o segundo ramo do OR
// abaixo EXIGE `propertyInterestId: null`. Uma atividade que pertence a
// uma negociação não pode ser reivindicada pela coluna da atividade,
// nem por acidente nem por dado inconsistente.
//
// `createdByMemberId` continua fora daqui, de propósito: atribuir posse
// a quem criou seria usar autoria como posse, que é exatamente a decisão
// que a Fase 21 tomou no sentido contrário.

/**
 * Fragmento de `where`: as atividades que são DESTE membro.
 *
 * `organizationId` é opcional porque alguns chamadores já o têm no
 * `where` externo; quando informado, ele entra também no predicado da
 * negociação, como defesa em profundidade contra relação cross-tenant.
 */
export function atividadeDoMembro(
  memberId: string,
  organizationId?: string
): Prisma.ScheduledActivityWhereInput {
  return {
    OR: [
      {
        propertyInterest: {
          is: { responsibleMemberId: memberId, ...(organizationId ? { organizationId } : {}) },
        },
      },
      // Sem negociação: a posse é da própria atividade. O
      // `propertyInterestId: null` é o que garante a precedência.
      { propertyInterestId: null, responsibleMemberId: memberId },
    ],
  };
}

/**
 * A mesma regra aplicada a um registro já carregado — para a tela dizer
 * de quem é o compromisso sem consultar de novo.
 */
export function responsavelEfetivoDaAtividade(atividade: {
  propertyInterestId: string | null;
  responsibleMemberId: string | null;
  propertyInterest?: { responsibleMemberId: string | null } | null;
}): string | null {
  if (atividade.propertyInterestId) {
    return atividade.propertyInterest?.responsibleMemberId ?? null;
  }
  return atividade.responsibleMemberId;
}

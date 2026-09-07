// =======================================================================
// Ator da transição de etapa (Fase 14)
// =======================================================================
// Quem MOVEU a negociação de etapa. Fecha a última lacuna de
// accountability do funil.
//
// -----------------------------------------------------------------------
// TRÊS ATORES DIFERENTES, NUNCA INTERCAMBIÁVEIS
// -----------------------------------------------------------------------
//   PropertyInterest.responsibleMemberId   quem CONDUZ a negociação
//   ...Payment.createdByMemberId           quem REGISTROU um pagamento
//   ...StageHistory.changedByMemberId      quem MOVEU esta etapa
//
// Um gerente pode fechar o negócio de outra pessoa: o histórico registra
// o gerente, e o responsável continua sendo quem era. Reaproveitar um
// campo pelo outro só porque os três apontam para OrganizationMember
// apagaria a diferença que esta fase existe para registrar.
// =======================================================================

import type { MemberStatus } from "@/generated/prisma/client";

// Rótulo do histórico sem ator. NÃO significa "ninguém moveu": significa
// que a transição é anterior a esta medição (zero backfill) ou que a
// sessão não tinha vínculo de organização no momento.
export const ATOR_NAO_REGISTRADO = "Ator não registrado";

export type AtorTransicao = {
  memberId: string;
  nome: string;
  // Membro suspenso continua sendo o ator histórico, com nome — nunca
  // colapsa em "não registrado", que apagaria quem fez o movimento.
  inativo: boolean;
};

type AtorBruto = {
  id: string;
  status: MemberStatus;
  organizationId: string;
  user: { name: string | null };
};

// `organizationIdEsperado` fecha o mesmo canal de vazamento indireto
// tratado no resto do projeto: a FK é simples (não composta com
// organizationId), então o banco por si só não impede uma linha anômala
// apontando para membro de OUTRO tenant. Nenhum caminho da aplicação
// grava isso — resolverAtorTransicao valida antes —, mas a leitura nunca
// confia: membro de outro tenant vira null e o nome jamais chega à tela.
export function paraAtorTransicao(
  membro: AtorBruto | null | undefined,
  organizationIdEsperado: string
): AtorTransicao | null {
  if (!membro) return null;
  if (membro.organizationId !== organizationIdEsperado) return null;
  return {
    memberId: membro.id,
    nome: membro.user.name?.trim() || "Membro sem nome",
    inativo: membro.status !== "ACTIVE",
  };
}

// Texto pronto para a interface, sempre legível — nunca só avatar ou cor.
export function rotuloAtorTransicao(ator: AtorTransicao | null): string {
  if (!ator) return ATOR_NAO_REGISTRADO;
  return ator.inativo ? `${ator.nome} (inativo)` : ator.nome;
}

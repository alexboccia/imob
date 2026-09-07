// =======================================================================
// Autoria da interação (Fase 15)
// =======================================================================
// ACHADO CENTRAL DA AUDITORIA, e ele contraria a dívida registrada desde
// a Fase 11: `Interaction.memberId` NÃO é um campo morto. Ele já é
// escrito pelos dois writers autenticados (registrarInteracao e a
// Interaction de VISIT criada ao concluir um agendamento) e já é
// deliberadamente omitido pelos três writers públicos.
//
// A dívida existia porque a varredura da Fase 11 filtrava a substring
// "organizationMemberId" — exatamente a expressão usada nas escritas
// (`memberId: session.user.organizationMemberId ?? null`), então elas
// nunca apareceram no grep. O dado sempre esteve lá; o que faltava era
// LER: a autoria nunca chegou a nenhuma tela.
//
// -----------------------------------------------------------------------
// TRÊS DIMENSÕES QUE NÃO SE SUBSTITUEM
// -----------------------------------------------------------------------
//   Person.source            canal comercial da PESSOA
//   Interaction.origin       CONTEXTO da captação (imóvel/contato/anuncie)
//   Interaction.memberId     ATOR INTERNO que registrou/executou
//
// E, fora da Interaction, mais duas que também são distintas:
//   PropertyInterest.responsibleMemberId   quem CONDUZ a negociação
//   StageHistory.changedByMemberId         quem MOVEU a etapa
//
// Ana pode ser a responsável enquanto Bruno registra a ligação: a
// interação é do Bruno e a responsável continua sendo a Ana.
//
// -----------------------------------------------------------------------
// O QUE `memberId = null` SIGNIFICA
// -----------------------------------------------------------------------
// Duas coisas diferentes, e a tela não pode confundi-las:
//
//   origin preenchido (IMOVEL/CONTATO/ANUNCIE)
//     -> captação PÚBLICA. Não há ator interno porque quem originou foi
//        o visitante. Isso é um fato completo, não um dado faltante —
//        rotular de "autor não registrado" sugeriria buraco onde não há.
//        A etiqueta de origem que a timeline já mostra é a resposta.
//
//   origin nulo
//     -> interação interna sem ator: histórico legado (anterior à
//        escrita do campo) ou sessão sem vínculo de organização. Aí sim
//        "Autor não registrado".
//
// ZERO BACKFILL: nada foi inferido de responsável, StageHistory,
// ActivityLog, ScheduledActivity, criador da pessoa nem de proximidade
// de timestamp.
// =======================================================================

import type { MemberStatus } from "@/generated/prisma/client";

export const AUTOR_NAO_REGISTRADO = "Autor não registrado";

export type AutorInteracao = {
  memberId: string;
  nome: string;
  // Membro suspenso continua sendo o autor histórico — desativar alguém
  // não apaga o que a pessoa fez.
  inativo: boolean;
};

type AutorBruto = {
  id: string;
  status: MemberStatus;
  organizationId: string;
  user: { name: string | null };
};

// `organizationIdEsperado` fecha o mesmo canal de vazamento indireto
// tratado no resto do projeto: a FK é simples (não composta com
// organizationId), então uma linha anômala apontando para membro de
// OUTRO tenant não é impedida pelo banco. A leitura nunca confia —
// membro de outro tenant vira null e o nome jamais chega à tela.
export function paraAutorInteracao(
  membro: AutorBruto | null | undefined,
  organizationIdEsperado: string
): AutorInteracao | null {
  if (!membro) return null;
  if (membro.organizationId !== organizationIdEsperado) return null;
  return {
    memberId: membro.id,
    nome: membro.user.name?.trim() || "Membro sem nome",
    inativo: membro.status !== "ACTIVE",
  };
}

// Texto da autoria para a timeline, ou `null` quando não há nada honesto
// a dizer.
//
// Devolve null para captação pública justamente para que a tela NÃO
// escreva "autor não registrado" num fato que sabemos, com certeza, ter
// nascido fora da equipe. A etiqueta de origem já comunica isso.
export function rotuloAutorInteracao(
  autor: AutorInteracao | null,
  origin: string | null
): string | null {
  if (autor) return autor.inativo ? `${autor.nome} (inativo)` : autor.nome;
  if (origin) return null;
  return AUTOR_NAO_REGISTRADO;
}

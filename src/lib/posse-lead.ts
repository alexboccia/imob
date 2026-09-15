// =======================================================================
// Posse do lead (Fase 36)
// =======================================================================
// A resposta a "DE QUEM É ESTE LEAD AGORA?".
//
// Cinco conceitos vivem no mesmo domínio e NÃO são o mesmo:
//
//   POSSE DA PESSOA     Person.responsibleMemberId          (esta fase)
//     quem deve conduzir este lead
//   AUTORIA DO REGISTRO Person.assignedMemberId             (CRM, Fase 22)
//     quem digitou o cadastro — nunca transferido, nunca posse
//   NEGOCIAÇÃO          PropertyInterest.responsibleMemberId (Fase 11)
//     quem conduz UM negócio específico com essa pessoa
//   COMPROMISSO         ScheduledActivity.responsibleMemberId (Fase 32)
//     quem deve cumprir UMA visita ou follow-up
//   VISIBILIDADE        escopo-comercial.ts
//     quem está autorizado a enxergar — derivada de vários fatos, e
//     jamais igual à posse
//
// Nenhum deles é sincronizado com outro. Assumir um lead não cria
// negociação; criar negociação não muda o dono do lead; agendar
// follow-up não muda nada. Cada fato é declarado por quem o pratica.
//
// -----------------------------------------------------------------------
// POSSE NÃO É ATENDIMENTO
// -----------------------------------------------------------------------
// Assumir é dizer "eu cuido disto", não "já falei com o cliente". Por
// isso assumir NÃO tira o contato da caixa de entrada: ele continua
// aguardando atendimento, agora com dono. Quem tira da fila é o
// atendimento registrado ou a oportunidade criada — a regra que já
// existia e que esta fase não tocou (ver novos-contatos.ts).
// =======================================================================

/** Como a posse de um lead é apresentada. Derivado, nunca persistido. */
export type EstadoPosse = "SEM_RESPONSAVEL" | "MEU" | "DE_OUTRO";

export function estadoDaPosse(
  responsavelMemberId: string | null,
  meuMemberId: string | null
): EstadoPosse {
  if (!responsavelMemberId) return "SEM_RESPONSAVEL";
  return responsavelMemberId === meuMemberId ? "MEU" : "DE_OUTRO";
}

// Texto, nunca só cor: "sem responsável" é um estado operacional que
// precisa ser legível por quem não distingue as duas tonalidades de
// cinza do badge.
export const ESTADO_POSSE_LABEL: Record<EstadoPosse, string> = {
  SEM_RESPONSAVEL: "Sem responsável",
  MEU: "Você é o responsável",
  DE_OUTRO: "Responsável",
};

/** O membro que aparece como responsável, já redigido contra tenant. */
export type ResponsavelPessoa = {
  memberId: string;
  nome: string;
  /** Membro desativado continua sendo o responsável histórico. */
  inativo: boolean;
};

type MembroBruto = {
  id: string;
  organizationId: string;
  status: string;
  user: { name: string | null };
} | null;

// Mesma defesa em profundidade do resto do projeto: a FK é simples, então
// a leitura nunca confia nela — membro de outro tenant é redigido para
// null e o nome jamais chega à tela. Espelha paraResponsavel/
// paraAtorTransicao, que fazem isto para as outras posses.
export function paraResponsavelPessoa(
  membro: MembroBruto,
  organizationIdEsperado: string
): ResponsavelPessoa | null {
  if (!membro || membro.organizationId !== organizationIdEsperado) return null;
  return {
    memberId: membro.id,
    nome: membro.user.name?.trim() || "Membro sem nome",
    inativo: membro.status !== "ACTIVE",
  };
}

// -----------------------------------------------------------------------
// Resultado de uma tentativa de tomar posse
// -----------------------------------------------------------------------
// ASSUMIR NUNCA ROUBA. A tentativa sobre um lead que já tem dono não é um
// erro do sistema nem uma condição de corrida: é a resposta correta, e o
// segundo corretor precisa saber disso em vez de ver a tela mudar sozinha.
export type ResultadoAssumir =
  | { tipo: "assumido" }
  | { tipo: "ja_era_meu" }
  | { tipo: "ja_assumido" };

export const MENSAGEM_ASSUMIR: Record<ResultadoAssumir["tipo"], string> = {
  assumido: "Contato assumido. Ele continua aguardando atendimento.",
  ja_era_meu: "Você já é o responsável por este contato.",
  ja_assumido: "Este contato já foi assumido por outro membro.",
};

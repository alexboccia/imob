import type { CommercialVisibility, Prisma } from "@/generated/prisma/client";
import { temPapel, PAPEIS_VISAO_EQUIPE } from "@/lib/authorization";

// =======================================================================
// Escopo comercial (Fase 22)
// =======================================================================
// TENANT é a primeira fronteira e não muda: toda query continua filtrando
// por organizationId. ESCOPO COMERCIAL é uma SEGUNDA fronteira, dentro do
// tenant, e é isto que este arquivo define — num lugar só, para que não
// existam vinte `if (role === "BROKER")` espalhados por actions.
//
// -----------------------------------------------------------------------
// O QUE A AUDITORIA ENCONTROU (e mudou a resposta)
// -----------------------------------------------------------------------
// `Person.assignedMemberId` NÃO É POSSE COMERCIAL, apesar do nome:
//   - tem UM único writer (criarPessoa), que grava o membro que criou;
//   - NUNCA é transferido — não existe action que o altere;
//   - lead do site público nasce com ele NULL (person-dedup.ts não o
//     preenche);
//   - é lido apenas para exibir o nome do corretor na lista.
// Ou seja: é AUTORIA DO REGISTRO. Usá-lo como chave de visibilidade
// esconderia todo lead público de todo corretor, manteria acesso eterno
// de quem criou, e negaria acesso a quem recebeu a negociação por
// transferência. Por isso o escopo de Person é derivado de NEGOCIAÇÃO.
//
// `PropertyInterest.responsibleMemberId` é quem CONDUZ (Fase 11), muda
// por transferência, e é o único campo do domínio que significa posse
// comercial. É ele que define o universo autorizado.
//
// Nunca são usados como posse: createdByMemberId (autor, Fases 14/17/19),
// Interaction.memberId (autor, Fase 15), StageHistory.changedByMemberId
// (ator, Fase 14) e Participant.memberId (beneficiário da comissão,
// Fase 12). Autor não é dono, e beneficiário de comissão não é dono do
// CRM.
// =======================================================================

export type EscopoComercial =
  // Vê a carteira inteira da organização — modo COLLABORATIVE, ou
  // qualquer papel da camada gerencial.
  | { tipo: "ORGANIZACAO" }
  // Vê apenas a carteira com que tem vínculo comercial.
  | { tipo: "MEMBRO"; memberId: string };

export function resolverEscopoComercial(contexto: {
  politica: CommercialVisibility;
  role: string | undefined;
  memberId: string | null | undefined;
}): EscopoComercial {
  if (contexto.politica === "COLLABORATIVE") return { tipo: "ORGANIZACAO" };
  // A camada gerencial da Fase 21 é a MESMA aqui, de propósito: quem
  // acompanha o trabalho da equipe precisa alcançar a carteira dela.
  if (temPapel(contexto.role, PAPEIS_VISAO_EQUIPE)) return { tipo: "ORGANIZACAO" };
  // Sessão sem vínculo de membro não tem carteira nenhuma. `__nenhum__`
  // nunca colide com um cuid, então o predicado não casa nada — falha
  // FECHADA, jamais abrindo a organização por ausência de dado.
  return { tipo: "MEMBRO", memberId: contexto.memberId || "__nenhum__" };
}

export const escopoEhOrganizacao = (escopo: EscopoComercial) => escopo.tipo === "ORGANIZACAO";

// -----------------------------------------------------------------------
// Fragmentos de `where` — a segurança entra na QUERY
// -----------------------------------------------------------------------
// Cada função devolve um fragmento para ser espalhado no `where` que já
// existe. No modo ORGANIZACAO o fragmento é `{}`: a query fica
// BYTE-A-BYTE a que sempre foi, que é a garantia mais forte possível de
// que nada regride para quem é colaborativo.
//
// PROIBIDO filtrar em memória: PII não deve sair do banco sem
// autorização, então o predicado vai no `where`, nunca num `.filter()`.

// NEGOCIAÇÃO — o predicado direto: eu conduzo.
//
// `responsibleMemberId: null` (sem responsável) fica DE FORA no modo
// restrito. A auditoria não encontrou nenhum mecanismo de "claim"/pegar
// para si: atribuir é uma transferência feita a partir do Pipeline, e a
// fila sem dono é justamente o que a visão gerencial da Fase 21 existe
// para mostrar. Tratá-la como pool aberto seria inventar um fluxo que o
// produto não tem.
export function whereNegociacao(escopo: EscopoComercial): Prisma.PropertyInterestWhereInput {
  return escopo.tipo === "ORGANIZACAO" ? {} : { responsibleMemberId: escopo.memberId };
}

// PESSOA — semântica DIFERENTE da negociação, de propósito.
//
// Um Person é visível quando existe vínculo comercial com ele. São dois,
// e nenhum é arbitrário:
//
//   1. tenho uma negociação com essa pessoa — o vínculo comercial de
//      fato, e o que sobrevive a transferências nos dois sentidos;
//   2. eu criei o registro e ele ainda não tem negociação nenhuma —
//      sem isto, cadastrar um cliente o tornaria invisível para quem
//      acabou de cadastrá-lo, que nenhuma política pretenderia.
//
// O item 2 é uma ponte estreita e declarada, não "posse": assim que a
// pessoa ganha negociações, quem as conduz é quem a enxerga.
//
// CONSEQUÊNCIA ACEITA E DOCUMENTADA: se dois corretores têm negociações
// com o MESMO Person, os dois veem a pessoa e o PII dela — o cliente é
// entidade da organização, e o telefone dele não pode existir em duas
// versões. O que permanece separado são as NEGOCIAÇÕES (whereNegociacao)
// e os compromissos delas.
export function wherePessoa(escopo: EscopoComercial): Prisma.PersonWhereInput {
  if (escopo.tipo === "ORGANIZACAO") return {};
  return {
    OR: [
      { propertyInterests: { some: { responsibleMemberId: escopo.memberId } } },
      { assignedMemberId: escopo.memberId, propertyInterests: { none: {} } },
    ],
  };
}

// COMPROMISSO — herda o dono da negociação (Fases 17/19), nunca de
// createdByMemberId.
//
// Atividade SEM negociação não tem dono objetivo. No modo restrito ela
// fica fora do escopo do membro (só a camada gerencial a vê), pela mesma
// razão conservadora da Fase 21: atribuí-la a quem a criou seria usar
// autoria como posse. Nenhum fluxo do produto cria atividade órfã.
export function whereAtividade(escopo: EscopoComercial): Prisma.ScheduledActivityWhereInput {
  if (escopo.tipo === "ORGANIZACAO") return {};
  return { propertyInterest: { is: { responsibleMemberId: escopo.memberId } } };
}

// -----------------------------------------------------------------------
// Escritas
// -----------------------------------------------------------------------
// Esconder leitura não basta: sem isto, um membro fora do escopo ainda
// poderia enviar o id de uma negociação alheia para uma Server Action e
// mover o stage, transferir o responsável ou concluir um compromisso.
//
// As actions do CRM já carregam o alvo com `where: { id, organizationId }`
// antes de mutar — sempre. Espalhar o predicado nesses `where` é o que
// transforma o escopo numa condição de banco em vez de uma checagem que
// alguém pode esquecer: o alvo fora do escopo simplesmente não é
// encontrado, e a action devolve o mesmo "não encontrado" que já devolve
// para outro tenant. Nunca revela que o recurso existe.
export function whereNegociacaoAlvo(
  escopo: EscopoComercial,
  interesseId: string,
  organizationId: string
): Prisma.PropertyInterestWhereInput {
  return { ...whereNegociacao(escopo), id: interesseId, organizationId };
}

export function wherePessoaAlvo(
  escopo: EscopoComercial,
  pessoaId: string,
  organizationId: string
): Prisma.PersonWhereInput {
  return { ...wherePessoa(escopo), id: pessoaId, organizationId };
}

export function whereAtividadeAlvo(
  escopo: EscopoComercial,
  atividadeId: string,
  organizationId: string
): Prisma.ScheduledActivityWhereInput {
  return { ...whereAtividade(escopo), id: atividadeId, organizationId };
}

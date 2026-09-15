import type { CommercialVisibility, Prisma } from "@/generated/prisma/client";
import { temPapel, PAPEIS_VISAO_EQUIPE } from "@/lib/authorization";
import { atividadeDoMembro } from "@/lib/responsavel-atividade";

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
// `PropertyInterest.responsibleMemberId` é quem CONDUZ A NEGOCIAÇÃO
// (Fase 11) e muda por transferência.
//
// -----------------------------------------------------------------------
// FASE 36 — A POSSE DA PESSOA PASSA A EXISTIR
// -----------------------------------------------------------------------
// Até aqui o escopo de Person derivava EXCLUSIVAMENTE da negociação, e
// isso tinha uma consequência que só apareceu quando a caixa de entrada
// foi construída: um lead do site não tem negociação nenhuma, então em
// política restrita ele não casava nenhum ramo e ficava invisível para
// TODO corretor — sem nenhuma forma de lhe dar um dono, porque criar a
// negociação exige um imóvel que um contato genérico não tem.
//
// `Person.responsibleMemberId` fecha isso. Ele é posse de verdade — tem
// action de assumir, action de atribuir, transferência gerencial e
// rastro no ActivityLog — e por isso entra aqui como ramo próprio.
//
// POR QUE O RAMO NOVO NÃO TEM `propertyInterests: { none: {} }`, ao
// contrário do ramo de autoria logo abaixo: a ponte de autoria é
// estreita de propósito (só vale enquanto ninguém conduz nada), porque
// ter digitado um cadastro não é ser dono dele. Posse é o oposto: se eu
// sou o responsável pelo lead, continuo responsável mesmo que um colega
// conduza uma negociação com a mesma pessoa. Perder a pessoa de vista
// nesse caso seria perder o próprio trabalho.
//
// O QUE ESTE RAMO NÃO FAZ: não dá acesso às NEGOCIAÇÕES da pessoa.
// `whereNegociacao` não mudou, e a ficha do cliente já carrega
// `propertyInterests` com o escopo de negociação aplicado à sub-relação.
// Ver a matriz completa em tests/integration/posse-lead.test.ts.
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
      // 1. conduzo uma negociação com ela
      { propertyInterests: { some: { responsibleMemberId: escopo.memberId } } },
      // 2. Fase 36 — sou o responsável pela pessoa (posse declarada)
      { responsibleMemberId: escopo.memberId },
      // 3. eu criei o registro e ninguém conduz nada ainda (autoria)
      { assignedMemberId: escopo.memberId, propertyInterests: { none: {} } },
    ],
  };
}

// FILA DE ENTRADA — um escopo mais largo que `wherePessoa`, e só aqui.
//
// Um lead que ninguém assumiu não é a carteira de um colega: é trabalho
// em aberto da organização. Se ele não aparecesse para o corretor, o
// botão "Assumir" não existiria em política restrita e a fila só poderia
// ser distribuída por um gestor — que foi exatamente o beco sem saída
// que esta fase veio desfazer.
//
// POR QUE NÃO ENTRA EM `wherePessoa`: lá isto tornaria TODA pessoa sem
// responsável da organização visível em /app/clientes, na busca e na
// ficha — incluindo cliente antigo que ninguém nunca assumiu. Aqui o
// alcance é só o da caixa de entrada, que já é restrita a contatos do
// site AGUARDANDO atendimento. Assim que alguém assume, o item sai da
// visão dos outros corretores pelo ramo 2 acima.
//
// TRADEOFF DECLARADO: em política restrita, os dados de contato de um
// lead AINDA NÃO ASSUMIDO ficam visíveis a todos os membros. É uma
// ampliação real e deliberada, limitada à fila de distribuição — sem
// ela, nenhum corretor consegue receber um lead por conta própria.
export function wherePessoaNaFilaDeEntrada(escopo: EscopoComercial): Prisma.PersonWhereInput {
  if (escopo.tipo === "ORGANIZACAO") return {};
  const doMembro = wherePessoa(escopo).OR ?? [];
  return { OR: [...doMembro, { responsibleMemberId: null }] };
}

// COMPROMISSO — a posse vem da negociação quando ela existe e, desde a
// Fase 32, da própria atividade quando não existe.
//
// O texto anterior dizia que "atividade SEM negociação não tem dono
// objetivo", e isso era verdade enquanto o único caminho de criação
// sempre trazia uma negociação. Quando a Caixa de Entrada passou a
// precisar agendar o próximo contato de um lead que ainda não virou
// oportunidade, a ausência de dono deixou de ser uma consequência
// aceitável e virou a lacuna que a coluna responsibleMemberId fechou.
//
// O que NÃO mudou: createdByMemberId continua sendo autoria e nunca
// posse, e a negociação continua soberana quando existe — ver
// atividadeDoMembro, onde a precedência é estrutural.
//
// Atividade histórica sem negociação e sem responsável continua fora do
// escopo restrito, exatamente como antes: nenhuma visibilidade foi
// reduzida, e nenhuma foi ampliada por acidente.
export function whereAtividade(escopo: EscopoComercial): Prisma.ScheduledActivityWhereInput {
  if (escopo.tipo === "ORGANIZACAO") return {};
  return atividadeDoMembro(escopo.memberId);
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

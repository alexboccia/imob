// =======================================================================
// Responsável pela negociação (Fase 11)
// =======================================================================
// O que este dado É: quem conduz a NEGOCIAÇÃO (PropertyInterest).
//
// -----------------------------------------------------------------------
// POR QUE UM CAMPO NOVO, E NÃO UM DOS ATORES QUE JÁ EXISTIAM
// -----------------------------------------------------------------------
// Auditoria completa do domínio (Fase 11). O produto já registrava cinco
// atores, e NENHUM deles responde "quem conduz esta negociação":
//
//   Property.responsibleMember          quem é responsável pelo IMÓVEL
//   Person.assignedMember               quem é responsável pelo CLIENTE
//   Interaction.member                  quem REGISTROU aquele contato
//   ScheduledActivity.createdByMember   quem CRIOU aquela visita
//   ActivityLog.userId                  quem EXECUTOU cada ação (User!)
//
// Captar o imóvel, atender o cliente, agendar a visita e conduzir a
// negociação são funções que podem pertencer a pessoas diferentes.
// Derivar o responsável comercial de qualquer um desses campos seria
// afirmar uma equivalência que o domínio não sustenta — e o resultado
// apareceria como accountability de alguém que talvez nunca tenha tocado
// no negócio.
//
// PropertyInterestStageHistory, importante, NÃO tem ator: nem sequer dá
// para saber quem moveu um card. "Quem marcou WON" só existe no
// ActivityLog, e em identidade GLOBAL (User), não tenant-specific.
//
// -----------------------------------------------------------------------
// RESPONSÁVEL != BENEFICIÁRIO FINANCEIRO
// -----------------------------------------------------------------------
// Ownership permite AGRUPAR comissão por responsável. Não prova
// pagamento, split, recebimento nem receita individual. Sem co-broker,
// parceiro ou percentual no domínio, continua valendo o que a Fase 10
// estabeleceu: "comissão do negócio", nunca "comissão do corretor".
// =======================================================================

import type { MemberStatus } from "@/generated/prisma/client";

// Rótulo único de "não há responsável". Existe como constante porque
// aparece na tela, no agrupamento do Analytics e no filtro do Kanban — e
// as três precisam dizer exatamente a mesma coisa.
export const SEM_RESPONSAVEL_LABEL = "Sem responsável";

// Chave de agrupamento do balde "sem responsável". Não é um id de membro
// e nunca colide com um cuid.
export const SEM_RESPONSAVEL_CHAVE = "__sem_responsavel__";

// Status que NÃO pode receber novas atribuições. SUSPENDED é o
// desativado do produto (/app/usuarios alterna ACTIVE <-> SUSPENDED);
// INVITED é quem ainda não aceitou o convite e portanto ainda não
// trabalha. Nenhum dos dois deixa de ser responsável HISTÓRICO — só não
// entra em atribuição nova.
export function membroPodeReceberNegociacao(status: MemberStatus): boolean {
  return status === "ACTIVE";
}

export type ResponsavelNegociacao = {
  memberId: string;
  nome: string;
  // true quando o membro não está ACTIVE. A tela mostra o nome + marca de
  // inativo; NUNCA vira "Sem responsável", que afirmaria que o negócio
  // não tinha dono.
  inativo: boolean;
};

type MembroBruto = {
  id: string;
  status: MemberStatus;
  organizationId: string;
  user: { name: string | null };
};

// Converte o membro carregado junto da negociação no dado de exibição.
//
// `organizationIdEsperado` fecha o mesmo canal de vazamento indireto já
// tratado no Pipeline e nas fichas: a FK de responsibleMemberId é simples
// (não composta com organizationId), então o banco não impede, por si só,
// uma linha anômala apontando para membro de OUTRO tenant. Nenhum caminho
// da aplicação cria isso — as actions validam antes de gravar — mas a
// leitura nunca confia: membro de outro tenant é REDIGIDO para null, e o
// nome dele jamais chega à tela.
export function paraResponsavel(
  membro: MembroBruto | null | undefined,
  organizationIdEsperado: string
): ResponsavelNegociacao | null {
  if (!membro) return null;
  if (membro.organizationId !== organizationIdEsperado) return null;
  return {
    memberId: membro.id,
    // User.name é a mesma fonte de nome já usada em /app/clientes para
    // Person.assignedMember. Nome vazio existe no schema (String?) e
    // vira um rótulo honesto em vez de string vazia na tela.
    nome: membro.user.name?.trim() || "Membro sem nome",
    inativo: !membroPodeReceberNegociacao(membro.status),
  };
}

// -----------------------------------------------------------------------
// Agregação por responsável — coortes SEPARADAS, de propósito
// -----------------------------------------------------------------------
// As duas métricas do produto vivem em janelas diferentes:
//   oportunidades -> CRIADAS no período
//   ganhos/perdidos -> FECHADOS no período (closedAt)
//
// Dividir uma pela outra produziria uma taxa entre coortes distintas: o
// ganho de hoje quase nunca é a oportunidade criada hoje. Por isso
// `taxaGanho` usa EXCLUSIVAMENTE a coorte de fechados —
// ganhos / (ganhos + perdidos) — e `oportunidades` fica como coluna
// informativa, nunca como denominador de nada.
export type LinhaResponsavel = {
  chave: string;
  nome: string;
  inativo: boolean;
  // Coorte A: criadas no período.
  oportunidades: number;
  // Coorte B: fechadas no período.
  ganhos: number;
  perdidos: number;
  // ganhos / (ganhos + perdidos), só coorte B. null quando não houve
  // NENHUM fechamento no período — nunca 0%, que afirmaria "fechou e
  // perdeu tudo".
  taxaGanho: number | null;
  // Soma dos ganhos COM valor registrado. Ganho sem valor não entra como
  // zero (mesma regra das Fases 9/10).
  valorFechado: number;
  comissao: number;
  // Declarados para a tela poder explicar o que ficou de fora.
  ganhosSemValor: number;
  ganhosSemComissao: number;
};

type OportunidadeCriada = { responsavel: ResponsavelNegociacao | null };
type Fechamento = {
  responsavel: ResponsavelNegociacao | null;
  ganho: boolean;
  closedValue: number | null;
  commissionValue: number | null;
};

const centavos = (n: number) => Math.round(n * 100) / 100;

export function agruparPorResponsavel(
  criadas: readonly OportunidadeCriada[],
  fechamentos: readonly Fechamento[]
): LinhaResponsavel[] {
  const linhas = new Map<string, LinhaResponsavel>();

  const garantir = (responsavel: ResponsavelNegociacao | null): LinhaResponsavel => {
    const chave = responsavel ? responsavel.memberId : SEM_RESPONSAVEL_CHAVE;
    const existente = linhas.get(chave);
    if (existente) return existente;
    const nova: LinhaResponsavel = {
      chave,
      nome: responsavel ? responsavel.nome : SEM_RESPONSAVEL_LABEL,
      inativo: responsavel ? responsavel.inativo : false,
      oportunidades: 0,
      ganhos: 0,
      perdidos: 0,
      taxaGanho: null,
      valorFechado: 0,
      comissao: 0,
      ganhosSemValor: 0,
      ganhosSemComissao: 0,
    };
    linhas.set(chave, nova);
    return nova;
  };

  for (const criada of criadas) garantir(criada.responsavel).oportunidades += 1;

  for (const fechamento of fechamentos) {
    const linha = garantir(fechamento.responsavel);
    if (!fechamento.ganho) {
      linha.perdidos += 1;
      continue;
    }
    linha.ganhos += 1;
    if (fechamento.closedValue != null) linha.valorFechado += fechamento.closedValue;
    else linha.ganhosSemValor += 1;
    if (fechamento.commissionValue != null) linha.comissao += fechamento.commissionValue;
    else linha.ganhosSemComissao += 1;
  }

  return [...linhas.values()]
    .map((linha) => {
      const encerrados = linha.ganhos + linha.perdidos;
      return {
        ...linha,
        valorFechado: centavos(linha.valorFechado),
        comissao: centavos(linha.comissao),
        taxaGanho: encerrados === 0 ? null : (linha.ganhos / encerrados) * 100,
      };
    })
    .sort(
      (a, b) =>
        b.ganhos - a.ganhos ||
        b.valorFechado - a.valorFechado ||
        b.oportunidades - a.oportunidades ||
        // "Sem responsável" sempre por último entre empates: é um balde
        // residual, não uma pessoa competindo no ranking.
        (a.chave === SEM_RESPONSAVEL_CHAVE ? 1 : b.chave === SEM_RESPONSAVEL_CHAVE ? -1 : 0) ||
        a.nome.localeCompare(b.nome, "pt-BR")
    );
}

// -----------------------------------------------------------------------
// Opções de responsável para os seletores
// -----------------------------------------------------------------------
export type OpcaoResponsavel = {
  memberId: string;
  nome: string;
  inativo: boolean;
};

// Ordena os membros para exibição: ativos primeiro, depois por nome. Puro
// de propósito — quem faz I/O é buscarMembrosAtribuiveis, abaixo, e este
// arquivo continua testável sem banco.
export function ordenarOpcoesResponsavel(
  membros: readonly { id: string; status: MemberStatus; user: { name: string | null } }[]
): OpcaoResponsavel[] {
  return membros
    .map((m) => ({
      memberId: m.id,
      nome: m.user.name?.trim() || "Membro sem nome",
      inativo: !membroPodeReceberNegociacao(m.status),
    }))
    .sort((a, b) => Number(a.inativo) - Number(b.inativo) || a.nome.localeCompare(b.nome, "pt-BR"));
}

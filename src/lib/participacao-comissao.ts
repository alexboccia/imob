// =======================================================================
// Participação na comissão (Fase 12)
// =======================================================================
// O que este dado É: quanto da COMISSÃO DO NEGÓCIO foi atribuído
// explicitamente a cada participante.
//
// -----------------------------------------------------------------------
// RESPONSÁVEL != BENEFICIÁRIO
// -----------------------------------------------------------------------
// A Fase 11 respondeu "quem conduz a negociação"
// (PropertyInterest.responsibleMemberId). Isso NÃO diz quem recebe
// dinheiro. Conduzir e participar economicamente são fatos diferentes, e
// o segundo só existe quando alguém o declara: nenhuma linha de
// participação nasce sozinha, nunca há "100% para o responsável",
// nunca 50/50, nunca percentual de mercado.
//
// -----------------------------------------------------------------------
// FONTE DE VERDADE: VALOR, NUNCA PERCENTUAL
// -----------------------------------------------------------------------
// Mesma decisão da Fase 10, pelo mesmo motivo: `commissionValue` é um
// valor monetário real, então a parcela também é. Um percentual
// persistido junto criaria duas fontes de verdade que divergem assim que
// o total for corrigido — o que a Fase 10 já provou ser possível
// (corrigirDadosFechamento). O "%" existe só como atalho de cálculo no
// navegador; o que vai ao banco é o valor confirmado.
//
// -----------------------------------------------------------------------
// O QUE ESTE NÚMERO AINDA NÃO É
// -----------------------------------------------------------------------
// "Comissão atribuída" não é receita recebida: o domínio não registra
// pagamento, imposto, repasse nem inadimplência. Por isso a interface
// diz "atribuída"/"participação", nunca "recebida" ou "receita líquida".
// =======================================================================

import type { MemberStatus } from "@/generated/prisma/client";

// Mesmo teto de sanidade de comissao.ts/valor-fechamento.ts, pelo mesmo
// motivo: um dígito a mais na máscara distorce mais que qualquer erro.
export const ALOCACAO_MAXIMA = 1_000_000_000;

export type AlocacaoInterpretada =
  | { ok: true; valor: number | null }
  | { ok: false; erro: string };

// Vazio/ausente devolve null com ok:true: registrar QUEM participou antes
// de saber QUANTO é um estado legítimo — a comissão total costuma ser
// definida depois do fechamento.
//
// Zero é RECUSADO: "sem parcela" já se expressa com null, e aceitar 0
// tornaria impossível distinguir "ainda não definida" de "coube zero".
export function interpretarAlocacao(bruto: unknown): AlocacaoInterpretada {
  if (bruto === null || bruto === undefined) return { ok: true, valor: null };
  if (typeof bruto !== "string" && typeof bruto !== "number") {
    return { ok: false, erro: "Valor de participação inválido." };
  }

  const texto = String(bruto).trim();
  if (!texto) return { ok: true, valor: null };

  const numero = Number(texto);
  if (!Number.isFinite(numero)) return { ok: false, erro: "Valor de participação inválido." };
  if (numero <= 0) {
    return {
      ok: false,
      erro: "A participação precisa ser maior que zero. Deixe em branco se ainda não estiver definida.",
    };
  }
  if (numero > ALOCACAO_MAXIMA) {
    return { ok: false, erro: "Valor de participação acima do limite permitido." };
  }
  const casas = texto.includes(".") ? texto.split(".")[1].length : 0;
  if (casas > 2) return { ok: false, erro: "Use no máximo duas casas decimais na participação." };

  return { ok: true, valor: numero };
}

const centavos = (n: number) => Math.round(n * 100) / 100;

// -----------------------------------------------------------------------
// Soma e saldo
// -----------------------------------------------------------------------
export type DivisaoComissao = {
  // Comissão total do negócio. null = não registrada (Fase 10).
  comissaoTotal: number | null;
  // Σ das parcelas efetivamente atribuídas. Participante sem parcela NÃO
  // entra como zero — entra em `participantesSemParcela`.
  distribuido: number;
  // comissaoTotal - distribuido. null quando não há comissão registrada:
  // sem total não existe saldo, e "R$ 0 não distribuído" seria falso.
  naoDistribuido: number | null;
  participantes: number;
  participantesSemParcela: number;
  // true quando há comissão e a soma bate exatamente com ela.
  distribuicaoCompleta: boolean;
};

export function resumirDivisao(
  comissaoTotal: number | null,
  alocacoes: readonly (number | null)[]
): DivisaoComissao {
  let distribuido = 0;
  let semParcela = 0;
  for (const valor of alocacoes) {
    if (valor === null || !Number.isFinite(valor)) {
      semParcela += 1;
      continue;
    }
    distribuido += valor;
  }
  distribuido = centavos(distribuido);

  const temTotal = comissaoTotal !== null && Number.isFinite(comissaoTotal);
  return {
    comissaoTotal: temTotal ? comissaoTotal : null,
    distribuido,
    naoDistribuido: temTotal ? centavos(comissaoTotal! - distribuido) : null,
    participantes: alocacoes.length,
    participantesSemParcela: semParcela,
    distribuicaoCompleta: temTotal && centavos(comissaoTotal! - distribuido) === 0,
  };
}

export type ValidacaoAlocacao = { ok: true } | { ok: false; erro: string };

// REGRA MATEMÁTICA FUNDAMENTAL: a soma das parcelas nunca pode passar da
// comissão do negócio. `outrasAlocacoes` é o conjunto JÁ gravado, sem a
// linha que está sendo criada/editada — quem chama é responsável por
// excluí-la, e é isso que faz a edição de uma parcela existente não
// competir consigo mesma.
//
// Sem comissão registrada não há teto contra o qual validar: atribuir
// valor é bloqueado (participar continua permitido, com parcela null).
export function validarAlocacaoContraTotal(
  novoValor: number | null,
  comissaoTotal: number | null,
  outrasAlocacoes: readonly (number | null)[]
): ValidacaoAlocacao {
  if (novoValor === null) return { ok: true };
  if (comissaoTotal === null || !Number.isFinite(comissaoTotal)) {
    return {
      ok: false,
      erro: "Registre a comissão do negócio antes de dividir. Sem o total não há como validar as parcelas.",
    };
  }
  const jaDistribuido = outrasAlocacoes.reduce<number>(
    (soma, v) => (v === null || !Number.isFinite(v) ? soma : soma + v),
    0
  );
  const total = centavos(jaDistribuido + novoValor);
  if (total > comissaoTotal) {
    return {
      ok: false,
      erro: "A soma das participações não pode ultrapassar a comissão do negócio.",
    };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------
// Exibição
// -----------------------------------------------------------------------
export type ParticipanteExibicao = {
  id: string;
  memberId: string;
  nome: string;
  // Membro suspenso continua na divisão histórica, com nome e marca de
  // inativo — a parcela dele NUNCA é apagada nem redistribuída.
  inativo: boolean;
  alocacao: number | null;
};

type ParticipanteBruto = {
  id: string;
  memberId: string;
  organizationId: string;
  allocationValue: number | null;
  member: { status: MemberStatus; organizationId: string; user: { name: string | null } };
};

// Converte as linhas carregadas em dado de tela. `organizationIdEsperado`
// fecha o mesmo canal de vazamento indireto já tratado no resto do
// projeto: as FKs são simples (não compostas com organizationId), então
// uma linha anômala apontando para membro de OUTRO tenant não é impedida
// pelo banco. Nenhum caminho da aplicação cria isso — as actions validam
// antes de gravar — mas a leitura nunca confia.
export function paraParticipantes(
  brutos: readonly ParticipanteBruto[],
  organizationIdEsperado: string
): ParticipanteExibicao[] {
  return brutos
    .filter(
      (p) =>
        p.organizationId === organizationIdEsperado &&
        p.member.organizationId === organizationIdEsperado
    )
    .map((p) => ({
      id: p.id,
      memberId: p.memberId,
      nome: p.member.user.name?.trim() || "Membro sem nome",
      inativo: p.member.status !== "ACTIVE",
      alocacao: p.allocationValue,
    }))
    .sort(
      (a, b) =>
        // Maior parcela primeiro; quem ainda não tem parcela vai ao fim,
        // nunca misturado com quem recebeu zero (que não existe).
        (b.alocacao ?? -1) - (a.alocacao ?? -1) || a.nome.localeCompare(b.nome, "pt-BR")
    );
}

// -----------------------------------------------------------------------
// Agregação por participante (Analytics)
// -----------------------------------------------------------------------
// Dimensão SEPARADA de "Performance por responsável" (Fase 11), que
// continua existindo: uma responde quem conduziu, a outra quem participou
// do dinheiro. A mesma pessoa pode aparecer nas duas com números
// diferentes, e isso é correto.
export type LinhaParticipante = {
  memberId: string;
  nome: string;
  inativo: boolean;
  // Negócios GANHOS no período em que a pessoa participa da divisão.
  negocios: number;
  // Σ das parcelas atribuídas a ela nesses negócios.
  comissaoAtribuida: number;
  // Participações registradas sem parcela definida — declaradas para a
  // tela não fingir que a pessoa recebeu zero.
  semParcela: number;
};

export function agruparPorParticipante(
  participacoes: readonly { participante: ParticipanteExibicao }[]
): LinhaParticipante[] {
  const linhas = new Map<string, LinhaParticipante>();
  for (const { participante } of participacoes) {
    const atual = linhas.get(participante.memberId) ?? {
      memberId: participante.memberId,
      nome: participante.nome,
      inativo: participante.inativo,
      negocios: 0,
      comissaoAtribuida: 0,
      semParcela: 0,
    };
    atual.negocios += 1;
    if (participante.alocacao === null) atual.semParcela += 1;
    else atual.comissaoAtribuida += participante.alocacao;
    linhas.set(participante.memberId, atual);
  }
  return [...linhas.values()]
    .map((l) => ({ ...l, comissaoAtribuida: centavos(l.comissaoAtribuida) }))
    .sort(
      (a, b) =>
        b.comissaoAtribuida - a.comissaoAtribuida ||
        b.negocios - a.negocios ||
        a.nome.localeCompare(b.nome, "pt-BR")
    );
}

// Atalho de percentual usado SÓ na interface, igual ao da Fase 10:
// converte "50" + comissão total em reais. Nada disso é persistido.
export function calcularAlocacaoPorPercentual(
  comissaoTotal: number | null,
  percentual: unknown
): number | null {
  if (comissaoTotal === null || !Number.isFinite(comissaoTotal) || comissaoTotal <= 0) return null;
  const numero = Number(String(percentual ?? "").replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0 || numero > 100) return null;
  return centavos((comissaoTotal * numero) / 100);
}

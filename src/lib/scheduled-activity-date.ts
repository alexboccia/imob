// Classificação temporal de ScheduledActivity (Fases H.2-H.7, corrigida
// na Fase 18).
//
// ATÉ A FASE 17 este arquivo usava a convenção UTC-literal: "hoje" era o
// dia calendário UTC, e o horário digitado no formulário era interpretado
// como UTC. Para uma imobiliária em UTC−3 isso fazia o dia virar às 21:00
// locais — uma visita de 07/09 22:00 em São Paulo já contava como 08/09.
//
// A PARTIR DA FASE 18 todo conceito de calendário é resolvido no fuso da
// ORGANIZAÇÃO (Organization.timezone, fallback explícito UTC). O fuso é um
// parâmetro OBRIGATÓRIO destas funções, deliberadamente sem valor padrão:
// esquecer de passá-lo é erro de compilação, nunca um UTC silencioso.
//
// A formatação para exibição mora inteira em src/lib/fuso-horario.ts
// (formatarDataHoraNoFuso e irmãs) — não há wrapper duplicado aqui.

import { intervaloDoDia, componentesNoFuso } from "@/lib/fuso-horario";

export type StatusScheduledActivity = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type PeriodoAgenda = "HOJE" | "PROXIMAS" | "ANTERIORES";

// Única fonte de verdade da classificação Hoje/Próximas/Anteriores — usada
// tanto pelos testes quanto (implicitamente, via os mesmos limites de
// intervaloDoDia) pelas queries em src/lib/agenda.ts e
// src/lib/central-trabalho.ts. COMPLETED e CANCELLED são sempre
// ANTERIORES, independente da data. Uma SCHEDULED cujo dia calendário DA
// ORGANIZAÇÃO já passou também cai em ANTERIORES — nunca muda de status
// sozinha (H.2: SCHEDULED no passado não expira automaticamente), só é
// classificada visualmente como histórico.
export function classificarPeriodoAgenda(
  atividade: { status: StatusScheduledActivity; scheduledAt: Date },
  fuso: string,
  agora: Date = new Date()
): PeriodoAgenda {
  if (atividade.status !== "SCHEDULED") return "ANTERIORES";
  const { inicio, fim } = intervaloDoDia(agora, fuso);
  if (atividade.scheduledAt >= inicio && atividade.scheduledAt <= fim) return "HOJE";
  if (atividade.scheduledAt > fim) return "PROXIMAS";
  return "ANTERIORES";
}

// "Atrasada" é só rótulo de apresentação (nunca persistido, nunca um
// enum): uma visita SCHEDULED cujo dia já passou. Uma visita SCHEDULED de
// HOJE cujo horário já passou dentro do próprio dia NÃO é considerada
// atrasada aqui — ela continua fazendo parte da agenda de hoje até o
// corretor concluir ou cancelar (decisão documentada na H.3: só o dia
// calendário conta, não a hora exata dentro do dia de hoje).
export function estaAtrasada(
  atividade: { status: StatusScheduledActivity; scheduledAt: Date },
  fuso: string,
  agora: Date = new Date()
): boolean {
  return (
    atividade.status === "SCHEDULED" &&
    classificarPeriodoAgenda(atividade, fuso, agora) === "ANTERIORES"
  );
}

// Filtro de período da Agenda (Fase H.4, corrigido na Fase 18): o valor
// cru de <input type="date"> é DATE-ONLY — ano/mês/dia, não um instante.
// parseDataCalendario/intervaloDaDataCalendario (src/lib/fuso-horario.ts)
// substituem o antigo parseDataUTC: a mesma data digitada agora recorta o
// dia comercial da organização, não o dia UTC.

// -----------------------------------------------------------------------
// Visão diária da aba Hoje (Fase H.5) — agrupamento por período,
// "horário passou" e "próxima visita". Tudo derivado em memória sobre a
// lista de Hoje já carregada por src/lib/agenda.ts; nada aqui persiste
// estado nem dispara query própria.
// -----------------------------------------------------------------------

export type PeriodoDia = "MANHA" | "TARDE" | "NOITE";

// Classifica pelo horário DE PAREDE no fuso da organização (Fase 18 —
// antes era getUTCHours, o que jogava uma visita das 19:00 em São Paulo
// para o dia seguinte de madrugada e a rotulava "Manhã"). Nunca o fuso do
// navegador nem o do processo. Faixas: Manhã [00:00, 12:00), Tarde
// [12:00, 18:00), Noite [18:00, 24:00).
export function periodoDaVisita(scheduledAt: Date, fuso: string): PeriodoDia {
  const hora = componentesNoFuso(scheduledAt, fuso).hora;
  if (hora < 12) return "MANHA";
  if (hora < 18) return "TARDE";
  return "NOITE";
}

// "Horário passou" (H.5) é deliberadamente DIFERENTE de "Atrasada"
// (estaAtrasada, H.3): atrasada exige que o DIA calendário já tenha
// passado; horário passou exige só que o HORÁRIO de hoje já tenha
// passado, no MESMO dia. Uma visita SCHEDULED de ontem nunca passa aqui
// como "horário passou" — classificarPeriodoAgenda já a classifica como
// ANTERIORES (não HOJE), então a checagem abaixo a exclui
// estruturalmente, sem precisar de lógica extra pra não confundir os
// dois conceitos. Continua SCHEDULED no banco; isto é só rótulo visual.
export function horarioJaPassouHoje(
  atividade: { status: StatusScheduledActivity; scheduledAt: Date },
  fuso: string,
  agora: Date = new Date()
): boolean {
  return (
    atividade.status === "SCHEDULED" &&
    classificarPeriodoAgenda(atividade, fuso, agora) === "HOJE" &&
    atividade.scheduledAt < agora
  );
}

// Primeira visita SCHEDULED cujo horário ainda não chegou
// (scheduledAt >= agora), a mais próxima no tempo. Genérico sobre
// qualquer lista com {status, scheduledAt} — não importa o tipo
// ItemAgenda de src/lib/agenda.ts (evitaria inverter a direção de
// dependência entre os dois arquivos). Sempre calculado sobre uma lista
// já carregada (o resultado filtrado/visível da aba Hoje), nunca
// dispara uma query própria.
export function proximaVisita<T extends { status: StatusScheduledActivity; scheduledAt: Date }>(
  itens: readonly T[],
  agora: Date = new Date()
): T | null {
  let escolhida: T | null = null;
  for (const item of itens) {
    if (item.status !== "SCHEDULED") continue;
    if (item.scheduledAt < agora) continue;
    if (!escolhida || item.scheduledAt < escolhida.scheduledAt) escolhida = item;
  }
  return escolhida;
}

// -----------------------------------------------------------------------
// Ação operacional recomendada (Fase H.7) — quarto conceito, distinto de
// período (HOJE/PROXIMAS/ANTERIORES, H.3), "horário passou" (H.5) e
// "atrasada" (H.3): é uma ORIENTAÇÃO sobre o que fazer, nunca um novo
// status/campo persistido — puramente derivada de status+scheduledAt, sem
// consultar banco, sem alterar dado, sem conhecer React. COMPLETED/
// CANCELLED nunca têm ação (a visita já está encerrada). Uma SCHEDULED de
// um dia FUTURO (PROXIMAS) também não tem ação nesta V1 — ainda não é
// hora de agir; decisão documentada aqui porque o pedido da H.7 não deu
// um exemplo explícito pra esse caso, só o de "hoje" e "dia anterior".
// -----------------------------------------------------------------------

export type AcaoOperacionalVisita =
  | "PREPARAR_VISITA"
  | "VISITA_AGORA"
  | "REGISTRAR_RESULTADO"
  | "RESOLVER_PENDENCIA"
  | null;

// Janela operacional de VISITA_AGORA (correção pós-auditoria H.7): igualdade
// exata de milissegundo entre scheduledAt (sempre gravado no minuto exato,
// sem segundos/ms — ver parseScheduledAt) e agora (precisão de milissegundo
// real, capturado no render) é praticamente inatingível em produção — na
// prática o estado nunca aparecia. Substituído por uma janela de tolerância
// simétrica em torno do horário agendado, nomeada (nunca número mágico
// espalhado pelo arquivo).
export const JANELA_VISITA_AGORA_MINUTOS = 5;
const JANELA_VISITA_AGORA_MS = JANELA_VISITA_AGORA_MINUTOS * 60 * 1000;

export function acaoOperacionalDaVisita(
  atividade: { status: StatusScheduledActivity; scheduledAt: Date },
  fuso: string,
  agora: Date = new Date()
): AcaoOperacionalVisita {
  if (atividade.status !== "SCHEDULED") return null;

  // classificarPeriodoAgenda decide o dia ANTES de qualquer comparação de
  // janela — uma visita de ontem/amanhã nunca vira VISITA_AGORA mesmo que a
  // diferença numérica de horário seja pequena (ex: 23:58 de ontem vs 00:02
  // de hoje), porque cai em ANTERIORES/PROXIMAS aqui, nunca chega a
  // calcular diffMs abaixo.
  const periodo = classificarPeriodoAgenda(atividade, fuso, agora);
  if (periodo === "ANTERIORES") return "RESOLVER_PENDENCIA";
  if (periodo === "PROXIMAS") return null;

  // periodo === "HOJE" — diffMs > 0 significa agora depois do horário
  // agendado (visita já começou/passou); <= 0 significa antes. Limites
  // inclusivos dos dois lados (exatamente ±5min conta como dentro da
  // janela), decisão explícita da correção pós-auditoria.
  const diffMs = agora.getTime() - atividade.scheduledAt.getTime();
  if (Math.abs(diffMs) <= JANELA_VISITA_AGORA_MS) return "VISITA_AGORA";
  if (diffMs < 0) return "PREPARAR_VISITA";
  return "REGISTRAR_RESULTADO";
}

// -----------------------------------------------------------------------
// Painel "Agora" (Fase H.7) — resume o estado operacional do dia num
// bloco pequeno no topo da aba Hoje, sem duplicar os cards individuais
// (que continuam aparecendo normalmente nos grupos Manhã/Tarde/Noite).
// Prioridade fixa: pendência REAL (REGISTRAR_RESULTADO — já passou da
// janela de VISITA_AGORA) > visita em andamento (VISITA_AGORA) > próxima
// futura (PROXIMA_VISITA, H.5, inalterado). Usa acaoOperacionalDaVisita
// (não horarioJaPassouHoje puro) pra decidir "aguardando resultado" —
// correção pós-auditoria: sem isso, uma visita só 1-2min após o horário
// (ainda dentro da janela) apareceria como pendência quando na verdade
// está "acontecendo agora". horarioJaPassouHoje em si permanece intocada
// e continua significando só "scheduledAt < agora" (usada em
// AgendaItemCard pro badge "Horário passou", que coexiste
// intencionalmente com VISITA_AGORA — ver comentário na função acima).
// Sempre calculado sobre a lista já carregada/filtrada (nunca dispara
// query própria); genérico sobre {status, scheduledAt} pelo mesmo motivo
// de proximaVisita acima (evita inverter a direção de dependência com
// src/lib/agenda.ts).
// -----------------------------------------------------------------------

export type EstadoPainelAgora<T> =
  | { tipo: "AGUARDANDO_RESULTADO"; quantidade: number; maisAntiga: T }
  | { tipo: "VISITA_AGORA"; visita: T }
  | { tipo: "PROXIMA_VISITA"; visita: T }
  | { tipo: "VAZIO" };

export function painelAgoraDoDia<T extends { status: StatusScheduledActivity; scheduledAt: Date }>(
  itens: readonly T[],
  fuso: string,
  agora: Date = new Date()
): EstadoPainelAgora<T> {
  const aguardandoResultado = itens.filter(
    (item) => acaoOperacionalDaVisita(item, fuso, agora) === "REGISTRAR_RESULTADO"
  );
  if (aguardandoResultado.length > 0) {
    const maisAntiga = aguardandoResultado.reduce((mais, atual) =>
      atual.scheduledAt < mais.scheduledAt ? atual : mais
    );
    return { tipo: "AGUARDANDO_RESULTADO", quantidade: aguardandoResultado.length, maisAntiga };
  }

  const emAndamento = itens.filter(
    (item) => acaoOperacionalDaVisita(item, fuso, agora) === "VISITA_AGORA"
  );
  if (emAndamento.length > 0) {
    const maisProxima = emAndamento.reduce((mais, atual) =>
      atual.scheduledAt < mais.scheduledAt ? atual : mais
    );
    return { tipo: "VISITA_AGORA", visita: maisProxima };
  }

  const proxima = proximaVisita(itens, agora);
  if (proxima) return { tipo: "PROXIMA_VISITA", visita: proxima };

  return { tipo: "VAZIO" };
}

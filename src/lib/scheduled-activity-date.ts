// Exibição/edição de scheduledAt (Fase H.2) — única fonte de verdade,
// usada por AgendamentoVisita.tsx e testável sem Prisma/DOM. H.2 V1 trata
// datetime-local como UTC literal (ver parseScheduledAt em
// scheduled-activity-schema.ts) porque Organization ainda não possui
// timezone configurado; uma evolução futura com timezone real por
// organização/usuário precisará revisitar só este arquivo.

// timeZone: "UTC" explícito é o que faz os componentes exibidos baterem
// com os componentes digitados — sem isso, toLocaleString converte pro
// timezone do navegador de quem está vendo a tela, não de quem agendou.
export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// iso já está em componentes UTC literais (formato
// "YYYY-MM-DDTHH:mm:ss.sssZ") — os primeiros 16 caracteres são
// exatamente o que <input type="datetime-local"> espera, sem nenhuma
// conversão de timezone no meio do caminho.
export function paraDatetimeLocal(iso: string): string {
  return iso.slice(0, 16);
}

// Só HH:mm (Fase H.7) — usado no painel "Agora", onde a data por extenso
// de formatarDataHora seria redundante (o próprio bloco já está no
// contexto "hoje"). Mesma convenção timeZone:"UTC" explícita.
export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// -----------------------------------------------------------------------
// Agrupamento temporal da Agenda (Fase H.3) — mesma convenção UTC-literal:
// "hoje" é o dia calendário UTC de `agora`, nunca o dia local de quem está
// olhando a tela. Os getters usados abaixo são todos os UTC* (nunca
// getFullYear/getMonth/getDate simples), por isso o resultado independe
// do timezone do processo — mesma garantia de determinismo de
// parseScheduledAt em scheduled-activity-schema.ts.
// -----------------------------------------------------------------------

export function inicioDoDiaUTC(agora: Date = new Date()): Date {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 0, 0, 0, 0));
}

export function fimDoDiaUTC(agora: Date = new Date()): Date {
  return new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 23, 59, 59, 999)
  );
}

export type StatusScheduledActivity = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type PeriodoAgenda = "HOJE" | "PROXIMAS" | "ANTERIORES";

// Única fonte de verdade da classificação Hoje/Próximas/Anteriores — usada
// tanto pelos testes quanto (implicitamente, via os mesmos limites
// inicioDoDiaUTC/fimDoDiaUTC) pela query em src/lib/agenda.ts. COMPLETED e
// CANCELLED são sempre ANTERIORES, independente da data. Uma SCHEDULED cujo
// dia (UTC-literal) já passou também cai em ANTERIORES — nunca muda de
// status sozinha (H.2: SCHEDULED no passado não expira automaticamente),
// só é classificada visualmente como histórico.
export function classificarPeriodoAgenda(
  atividade: { status: StatusScheduledActivity; scheduledAt: Date },
  agora: Date = new Date()
): PeriodoAgenda {
  if (atividade.status !== "SCHEDULED") return "ANTERIORES";
  const inicioHoje = inicioDoDiaUTC(agora);
  const fimHoje = fimDoDiaUTC(agora);
  if (atividade.scheduledAt >= inicioHoje && atividade.scheduledAt <= fimHoje) return "HOJE";
  if (atividade.scheduledAt > fimHoje) return "PROXIMAS";
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
  agora: Date = new Date()
): boolean {
  return atividade.status === "SCHEDULED" && classificarPeriodoAgenda(atividade, agora) === "ANTERIORES";
}

// -----------------------------------------------------------------------
// Filtro de período da Agenda (Fase H.4) — mesma convenção UTC-literal:
// "YYYY-MM-DD" (valor cru de <input type="date">) é interpretado como
// data de calendário UTC, nunca timezone local do navegador/processo.
// -----------------------------------------------------------------------

// Retorna null pra qualquer valor sintaticamente inválido OU uma data que
// não existe no calendário (ex: "2026-02-30", que new Date(Date.UTC(...))
// rolaria silenciosamente pra 2026-03-02) — usar Date.UTC cru sem essa
// checagem deixaria uma data absurda virar uma query Prisma "válida" mas
// enganosa. Quem chama trata null como "filtro ausente", nunca como erro
// que precisa de 500.
export function parseDataUTC(valor: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!match) return null;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    return null;
  }
  return data;
}

// -----------------------------------------------------------------------
// Visão diária da aba Hoje (Fase H.5) — agrupamento por período,
// "horário passou" e "próxima visita". Tudo derivado em memória sobre a
// lista de Hoje já carregada por src/lib/agenda.ts; nada aqui persiste
// estado nem dispara query própria.
// -----------------------------------------------------------------------

export type PeriodoDia = "MANHA" | "TARDE" | "NOITE";

// Classifica pelo horário UTC-literal (getUTCHours — nunca o fuso local
// do navegador/processo, mesma convenção do resto do arquivo). Faixas:
// Manhã [00:00, 12:00), Tarde [12:00, 18:00), Noite [18:00, 24:00).
export function periodoDaVisita(scheduledAt: Date): PeriodoDia {
  const hora = scheduledAt.getUTCHours();
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
  agora: Date = new Date()
): boolean {
  return (
    atividade.status === "SCHEDULED" &&
    classificarPeriodoAgenda(atividade, agora) === "HOJE" &&
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
  agora: Date = new Date()
): AcaoOperacionalVisita {
  if (atividade.status !== "SCHEDULED") return null;

  // classificarPeriodoAgenda decide o dia ANTES de qualquer comparação de
  // janela — uma visita de ontem/amanhã nunca vira VISITA_AGORA mesmo que a
  // diferença numérica de horário seja pequena (ex: 23:58 de ontem vs 00:02
  // de hoje), porque cai em ANTERIORES/PROXIMAS aqui, nunca chega a
  // calcular diffMs abaixo.
  const periodo = classificarPeriodoAgenda(atividade, agora);
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
  agora: Date = new Date()
): EstadoPainelAgora<T> {
  const aguardandoResultado = itens.filter(
    (item) => acaoOperacionalDaVisita(item, agora) === "REGISTRAR_RESULTADO"
  );
  if (aguardandoResultado.length > 0) {
    const maisAntiga = aguardandoResultado.reduce((mais, atual) =>
      atual.scheduledAt < mais.scheduledAt ? atual : mais
    );
    return { tipo: "AGUARDANDO_RESULTADO", quantidade: aguardandoResultado.length, maisAntiga };
  }

  const emAndamento = itens.filter((item) => acaoOperacionalDaVisita(item, agora) === "VISITA_AGORA");
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

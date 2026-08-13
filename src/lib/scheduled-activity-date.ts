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

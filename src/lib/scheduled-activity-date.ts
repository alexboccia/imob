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

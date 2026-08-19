// Funções puras (sem Prisma/I/O) de composição de dados já buscados —
// pra alimentar a listagem redesenhada de Clientes sem misturar
// data-shaping com a query em page.tsx (facilita teste unitário real,
// sem precisar de Postgres). Nenhuma delas decide QUAIS dados buscar, só
// como resumir o que já veio da query batched.
import { formatarPreco } from "@/lib/format";
import { obterProximaAcaoComercial } from "@/lib/proxima-acao-comercial";
import type { PropertyInterestStage, PropertyStatus } from "@/generated/prisma/client";

// ---------- Interesse (resumo de PersonPreference) ----------

const TRANSACAO_LABEL: Record<string, string> = {
  SALE: "Comprar",
  RENT: "Alugar",
  SALE_AND_RENT: "Comprar ou alugar",
};

export type PreferenciaResumo = {
  propertyTypes: string[];
  transactionType: string | null;
  neighborhoods: string[];
  cities: string[];
  minPrice: unknown;
  maxPrice: unknown;
  // PersonPreference.minBedrooms é um PISO, sem maxBedrooms correspondente
  // no schema (ver prisma/schema.prisma) — nunca inventar um campo de
  // "faixa" que não existe.
  minBedrooms: number | null;
};

// "Interesse" na listagem é o que a pessoa está PROCURANDO (PersonPreference
// — critério de busca), não um PropertyInterest específico (que é o
// vínculo com UM imóvel já listado, com sua própria seção detalhada na
// ficha do cliente). Retorna null quando não há preferência cadastrada —
// quem chama decide o fallback textual ("Interesse não informado"), esta
// função nunca inventa um resumo vazio.
export function resumirInteresse(preferencia: PreferenciaResumo | null): string[] | null {
  if (!preferencia) return null;
  const linhas: string[] = [];

  const tipo = preferencia.propertyTypes[0];
  const transacao = preferencia.transactionType
    ? TRANSACAO_LABEL[preferencia.transactionType]
    : undefined;
  if (tipo || transacao) {
    linhas.push([tipo, transacao].filter(Boolean).join(" • "));
  }

  const local = preferencia.neighborhoods.length > 0 ? preferencia.neighborhoods : preferencia.cities;
  if (local.length > 0) linhas.push(local.slice(0, 2).join(", "));

  if (preferencia.minPrice != null || preferencia.maxPrice != null) {
    if (preferencia.minPrice != null && preferencia.maxPrice != null) {
      linhas.push(`${formatarPreco(preferencia.minPrice)} - ${formatarPreco(preferencia.maxPrice)}`);
    } else {
      linhas.push(`até ${formatarPreco(preferencia.maxPrice ?? preferencia.minPrice)}`);
    }
  }

  if (preferencia.minBedrooms != null) {
    linhas.push(`${preferencia.minBedrooms}+ quartos`);
  }

  return linhas.length > 0 ? linhas : null;
}

// ---------- Último contato (resumo de Interaction) ----------

export type InteracaoResumo = { occurredAt: Date; type: string };

function formatarDataContato(data: Date): string {
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dia = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const diffDias = Math.round((hoje.getTime() - dia.getTime()) / 86_400_000);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (diffDias === 0) return `Hoje, ${hora}`;
  if (diffDias === 1) return `Ontem, ${hora}`;
  return `${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${hora}`;
}

// null = "nenhum contato registrado ainda" — quem chama decide o texto de
// fallback, mesma convenção de resumirInteresse.
export function resumirUltimoContato(
  interacao: InteracaoResumo | null
): { texto: string; tipoLabel: string } | null {
  if (!interacao) return null;
  return { texto: formatarDataContato(interacao.occurredAt), tipoLabel: interacao.type };
}

// ---------- Próxima ação (visita agendada > PropertyInterest aberto > nenhuma) ----------

export type ProximaAcaoResumo = { texto: string; dataTexto: string | null; urgente: boolean };

// Prioridade: 1) próxima visita já agendada (ScheduledActivity SCHEDULED,
// dado concreto/datado — nunca reimplementado, só lido); 2) próxima ação
// comercial do PropertyInterest mais recentemente atualizado, via
// obterProximaAcaoComercial (regra de negócio já existente, reaproveitada
// tal qual, nunca reimplementada aqui); 3) null ("sem próxima ação" —
// fallback honesto, sem inventar narrativa pra quem não tem nenhum
// PropertyInterest nem visita).
export function resumirProximaAcao(params: {
  proximaVisita: { scheduledAt: Date } | null;
  interesseAberto: { stage: PropertyInterestStage; propertyStatus: PropertyStatus } | null;
}): ProximaAcaoResumo | null {
  if (params.proximaVisita) {
    const data = params.proximaVisita.scheduledAt;
    const dataTexto = `${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    return { texto: "Visita agendada", dataTexto, urgente: false };
  }

  if (params.interesseAberto) {
    const acao = obterProximaAcaoComercial(
      params.interesseAberto.stage,
      params.interesseAberto.propertyStatus
    );
    if (acao.ativa) return { texto: acao.label, dataTexto: null, urgente: false };
  }

  return null;
}

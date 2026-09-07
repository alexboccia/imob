import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { STATUS_IMOVEL_LABEL } from "@/lib/format";
import { chaveDoMes, componentesNoFuso, inicioDoMesNoFuso } from "@/lib/fuso-horario";

// Redesenho do Dashboard — achado de investigação: o Dashboard anterior
// contava "negócios fechados" via `prisma.deal.count(...)`, mas o Deal
// model NUNCA é escrito por nenhum fluxo real do produto (confirmado:
// zero `.deal.create(...)` em todo `src/app`/`src/lib` — só existe em
// fixtures de teste). O fechamento real de uma negociação, desde a
// Fase P.3 do Pipeline, é `PropertyInterest.stage = "WON"` com
// `closedAt` preenchido (ver `fecharInteresse`/`marcarInteresseComoGanho`
// em src/app/app/clientes/actions.ts, e a própria buscarMetricasPipeline
// abaixo em src/lib/pipeline.ts, que já usa exatamente esse critério).
// Isso significa que o KPI antigo muito provavelmente sempre mostrou 0
// em produção, mesmo com negócios reais fechados pelo Pipeline —
// corrigido aqui para a fonte real, decisão confirmada explicitamente
// antes de implementar (ver relatório final).
const DIAS_JANELA_ESTAGNACAO = 90;
const MESES_JANELA_TENDENCIA = 6;

// Fase 18 — mês calendário DA ORGANIZAÇÃO. Antes, `chaveMes` usava
// getUTC* e `rotuloMes` usava getters LOCAIS do processo: as duas metades
// da mesma janela podiam discordar sobre o mês de um evento ocorrido nas
// primeiras horas do dia 1º.
export function chaveMes(data: Date, fuso: string): string {
  return chaveDoMes(data, fuso);
}

export function rotuloMes(data: Date, fuso: string): string {
  const mes = data
    .toLocaleString("pt-BR", { timeZone: fuso, month: "short" })
    .replace(".", "");
  const ano = String(componentesNoFuso(data, fuso).ano).slice(-2);
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)}/${ano}`;
}

export type MesJanela = { chave: string; rotulo: string };

// Últimos `quantidade` meses terminando no mês de `referencia` (inclusive),
// sempre em ordem cronológica crescente — mesmo helper usado tanto pra
// construir a janela de busca (seisMesesAtras) quanto pra bucketizar o
// resultado, garantindo que as duas pontas nunca divirjam.
export function mesesJanela(referencia: Date, quantidade: number, fuso: string): MesJanela[] {
  const meses: MesJanela[] = [];
  for (let i = quantidade - 1; i >= 0; i--) {
    // inicioDoMesNoFuso desloca no CAMPO mês (Date.UTC normaliza a virada
    // de ano) — nunca setMonth sobre um Date em horário local do
    // processo, que era o que fazia a janela depender de onde o servidor
    // roda.
    const data = inicioDoMesNoFuso(referencia, fuso, -i);
    meses.push({ chave: chaveMes(data, fuso), rotulo: rotuloMes(data, fuso) });
  }
  return meses;
}

// Bucketiza uma lista de itens (cada um com uma data relevante) nos meses
// da janela — usado tanto pra leads (createdAt) quanto pra negócios
// fechados (closedAt), eliminando a duplicação de loop que existia antes
// (dois `for` quase idênticos direto em page.tsx).
export function bucketizarPorMes<T>(
  itens: readonly T[],
  meses: readonly MesJanela[],
  extrairData: (item: T) => Date | null,
  fuso: string
): Map<string, number> {
  const contagem = new Map(meses.map((m) => [m.chave, 0]));
  for (const item of itens) {
    const data = extrairData(item);
    if (!data) continue;
    const chave = chaveMes(data, fuso);
    if (contagem.has(chave)) {
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
  }
  return contagem;
}

export type PontoTendencia = { mes: string; leads: number; negocios: number };
export type ItemComposicao = { nome: string; total: number };

export type MetricasDashboard = {
  imoveisDisponiveis: number;
  leadsNoMes: number;
  negociosFechadosNoMes: number;
  imoveisParados: number;
  tendencia: PontoTendencia[];
  composicaoTipo: ItemComposicao[];
  composicaoBairro: ItemComposicao[];
  composicaoStatus: ItemComposicao[];
};

const porTotalDesc = (a: ItemComposicao, b: ItemComposicao) => b.total - a.total;

// Teto de itens exibidos nas composições Tipo/Bairro — mesmo valor já
// usado antes do redesenho. Status não tem teto: o enum PropertyStatus
// tem só 6 valores fixos, nunca precisa cortar.
const TETO_COMPOSICAO = 8;

// Agregado único do Dashboard — 9 queries baratas (4 count, 2 findMany
// enxutos só com a data necessária, 3 groupBy), todas num único
// Promise.all, organizationId explícito em cada uma (mesmo padrão
// defensivo já usado em todo o projeto, independente do fallback via
// withOrganization). Nenhuma delas por linha/por card — mesma contagem
// de queries que o Dashboard já fazia antes do redesenho (só a fonte de
// "negócios" mudou de Deal pra PropertyInterest, ver comentário do
// arquivo).
export async function buscarMetricasDashboard(
  organizationId: string,
  // Fase 18 — "neste mês" e a janela de tendência são conceitos de
  // calendário e passam a ser da ORGANIZAÇÃO. Antes, setHours(0,0,0,0)
  // resolvia no fuso do PROCESSO: o mesmo lead contava em meses
  // diferentes em dev (São Paulo) e em produção (contêiner UTC).
  fuso: string,
  opcoes: { agora?: Date } = {}
): Promise<MetricasDashboard> {
  const agora = opcoes.agora ?? new Date();

  const inicioDoMes = inicioDoMesNoFuso(agora, fuso);

  // Estagnação continua sendo uma DURAÇÃO (90 dias corridos a partir de
  // agora), não um recorte de calendário — por isso não passa pelo fuso.
  const limiteEstagnacao = new Date(agora.getTime() - DIAS_JANELA_ESTAGNACAO * 86_400_000);

  const meses = mesesJanela(agora, MESES_JANELA_TENDENCIA, fuso);
  const inicioDaJanela = inicioDoMesNoFuso(agora, fuso, -(MESES_JANELA_TENDENCIA - 1));

  return withOrganization(organizationId, async () => {
    const [
      imoveisDisponiveis,
      leadsNoMes,
      negociosFechadosNoMes,
      imoveisParados,
      leadsRecentes,
      negociosRecentes,
      porTipo,
      porBairro,
      porStatus,
    ] = await Promise.all([
      prisma.property.count({ where: { organizationId, status: "AVAILABLE" } }),
      prisma.person.count({
        where: { organizationId, roles: { has: "LEAD" }, createdAt: { gte: inicioDoMes } },
      }),
      prisma.propertyInterest.count({
        where: { organizationId, stage: "WON", closedAt: { gte: inicioDoMes } },
      }),
      prisma.property.count({
        where: { organizationId, status: "AVAILABLE", publishedAt: { lt: limiteEstagnacao } },
      }),
      prisma.person.findMany({
        where: { organizationId, roles: { has: "LEAD" }, createdAt: { gte: inicioDaJanela } },
        select: { createdAt: true },
      }),
      prisma.propertyInterest.findMany({
        where: { organizationId, stage: "WON", closedAt: { gte: inicioDaJanela } },
        select: { closedAt: true },
      }),
      prisma.property.groupBy({ where: { organizationId }, by: ["type"], _count: true }),
      prisma.property.groupBy({ where: { organizationId }, by: ["neighborhood"], _count: true }),
      prisma.property.groupBy({ where: { organizationId }, by: ["status"], _count: true }),
    ]);

    const contagemLeads = bucketizarPorMes(leadsRecentes, meses, (l) => l.createdAt, fuso);
    const contagemNegocios = bucketizarPorMes(negociosRecentes, meses, (n) => n.closedAt, fuso);

    const tendencia: PontoTendencia[] = meses.map((m) => ({
      mes: m.rotulo,
      leads: contagemLeads.get(m.chave) ?? 0,
      negocios: contagemNegocios.get(m.chave) ?? 0,
    }));

    const composicaoTipo: ItemComposicao[] = porTipo
      .map((g) => ({ nome: g.type, total: g._count }))
      .sort(porTotalDesc)
      .slice(0, TETO_COMPOSICAO);

    const composicaoBairro: ItemComposicao[] = porBairro
      .map((g) => ({ nome: g.neighborhood, total: g._count }))
      .sort(porTotalDesc)
      .slice(0, TETO_COMPOSICAO);

    const composicaoStatus: ItemComposicao[] = porStatus
      .map((g) => ({ nome: STATUS_IMOVEL_LABEL[g.status] ?? g.status, total: g._count }))
      .sort(porTotalDesc);

    return {
      imoveisDisponiveis,
      leadsNoMes,
      negociosFechadosNoMes,
      imoveisParados,
      tendencia,
      composicaoTipo,
      composicaoBairro,
      composicaoStatus,
    };
  });
}

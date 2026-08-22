import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { STATUS_IMOVEL_LABEL } from "@/lib/format";

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

export function chaveMes(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function rotuloMes(data: Date): string {
  const mes = data.toLocaleString("pt-BR", { month: "short" }).replace(".", "");
  const ano = String(data.getFullYear()).slice(-2);
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)}/${ano}`;
}

export type MesJanela = { chave: string; rotulo: string };

// Últimos `quantidade` meses terminando no mês de `referencia` (inclusive),
// sempre em ordem cronológica crescente — mesmo helper usado tanto pra
// construir a janela de busca (seisMesesAtras) quanto pra bucketizar o
// resultado, garantindo que as duas pontas nunca divirjam.
export function mesesJanela(referencia: Date, quantidade: number): MesJanela[] {
  const meses: MesJanela[] = [];
  for (let i = quantidade - 1; i >= 0; i--) {
    const data = new Date(referencia);
    data.setDate(1);
    data.setMonth(data.getMonth() - i);
    meses.push({ chave: chaveMes(data), rotulo: rotuloMes(data) });
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
  extrairData: (item: T) => Date | null
): Map<string, number> {
  const contagem = new Map(meses.map((m) => [m.chave, 0]));
  for (const item of itens) {
    const data = extrairData(item);
    if (!data) continue;
    const chave = chaveMes(data);
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
  opcoes: { agora?: Date } = {}
): Promise<MetricasDashboard> {
  const agora = opcoes.agora ?? new Date();

  const inicioDoMes = new Date(agora);
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const limiteEstagnacao = new Date(agora);
  limiteEstagnacao.setDate(limiteEstagnacao.getDate() - DIAS_JANELA_ESTAGNACAO);

  const meses = mesesJanela(agora, MESES_JANELA_TENDENCIA);
  const inicioDaJanela = new Date(agora);
  inicioDaJanela.setDate(1);
  inicioDaJanela.setMonth(inicioDaJanela.getMonth() - (MESES_JANELA_TENDENCIA - 1));
  inicioDaJanela.setHours(0, 0, 0, 0);

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

    const contagemLeads = bucketizarPorMes(leadsRecentes, meses, (l) => l.createdAt);
    const contagemNegocios = bucketizarPorMes(negociosRecentes, meses, (n) => n.closedAt);

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

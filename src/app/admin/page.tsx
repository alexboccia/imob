import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_IMOVEL_LABEL } from "@/lib/format";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import {
  DashboardCharts,
  type PontoTendencia,
  type ItemComposicao,
} from "@/components/admin/DashboardCharts";

function chaveMes(data: Date) {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rotuloMes(data: Date) {
  const mes = data.toLocaleString("pt-BR", { month: "short" }).replace(".", "");
  const ano = String(data.getFullYear()).slice(-2);
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)}/${ano}`;
}

export default async function DashboardPage() {
  const organizationId = await requireOrganizationId();

  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const noventaDiasAtras = new Date();
  noventaDiasAtras.setDate(noventaDiasAtras.getDate() - 90);

  const seisMesesAtras = new Date();
  seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5);
  seisMesesAtras.setDate(1);
  seisMesesAtras.setHours(0, 0, 0, 0);

  const [
    imoveisAtivos,
    leadsNoMes,
    negociosNoMes,
    imoveisParados,
    leadsRecentes,
    negociosRecentes,
    porTipo,
    porBairro,
    porStatus,
  ] = await withOrganization(organizationId, () =>
    Promise.all([
      prisma.property.count({ where: { organizationId, status: "AVAILABLE" } }),
      prisma.person.count({
        where: { organizationId, roles: { has: "LEAD" }, createdAt: { gte: inicioDoMes } },
      }),
      prisma.deal.count({ where: { organizationId, closedAt: { gte: inicioDoMes } } }),
      prisma.property.count({
        where: {
          organizationId,
          status: "AVAILABLE",
          publishedAt: {
            lt: noventaDiasAtras,
          },
        },
      }),
      prisma.person.findMany({
        where: { organizationId, roles: { has: "LEAD" }, createdAt: { gte: seisMesesAtras } },
        select: { createdAt: true },
      }),
      prisma.deal.findMany({
        where: { organizationId, closedAt: { gte: seisMesesAtras } },
        select: { closedAt: true },
      }),
      prisma.property.groupBy({ where: { organizationId }, by: ["type"], _count: true }),
      prisma.property.groupBy({ where: { organizationId }, by: ["neighborhood"], _count: true }),
      prisma.property.groupBy({ where: { organizationId }, by: ["status"], _count: true }),
    ])
  );

  const cards = [
    { label: "Imóveis disponíveis", valor: imoveisAtivos },
    { label: "Novos leads no mês", valor: leadsNoMes },
    { label: "Negócios fechados no mês", valor: negociosNoMes },
    { label: "Imóveis parados há +90 dias", valor: imoveisParados },
  ];

  const meses: { chave: string; rotulo: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const data = new Date();
    data.setDate(1);
    data.setMonth(data.getMonth() - i);
    meses.push({ chave: chaveMes(data), rotulo: rotuloMes(data) });
  }

  const contagemLeads = new Map(meses.map((m) => [m.chave, 0]));
  for (const lead of leadsRecentes) {
    const chave = chaveMes(lead.createdAt);
    if (contagemLeads.has(chave)) {
      contagemLeads.set(chave, (contagemLeads.get(chave) ?? 0) + 1);
    }
  }

  const contagemNegocios = new Map(meses.map((m) => [m.chave, 0]));
  for (const negocio of negociosRecentes) {
    if (!negocio.closedAt) continue;
    const chave = chaveMes(negocio.closedAt);
    if (contagemNegocios.has(chave)) {
      contagemNegocios.set(chave, (contagemNegocios.get(chave) ?? 0) + 1);
    }
  }

  const tendencia: PontoTendencia[] = meses.map((m) => ({
    mes: m.rotulo,
    leads: contagemLeads.get(m.chave) ?? 0,
    negocios: contagemNegocios.get(m.chave) ?? 0,
  }));

  const porTotal = (a: ItemComposicao, b: ItemComposicao) => b.total - a.total;

  const composicaoTipo: ItemComposicao[] = porTipo
    .map((g) => ({ nome: g.type, total: g._count }))
    .sort(porTotal)
    .slice(0, 8);

  const composicaoBairro: ItemComposicao[] = porBairro
    .map((g) => ({ nome: g.neighborhood, total: g._count }))
    .sort(porTotal)
    .slice(0, 8);

  const composicaoStatus: ItemComposicao[] = porStatus
    .map((g) => ({
      nome: STATUS_IMOVEL_LABEL[g.status] ?? g.status,
      total: g._count,
    }))
    .sort(porTotal);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent>
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-3xl font-semibold mt-1">{card.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <DashboardCharts
        tendencia={tendencia}
        composicaoTipo={composicaoTipo}
        composicaoBairro={composicaoBairro}
        composicaoStatus={composicaoStatus}
      />
    </div>
  );
}

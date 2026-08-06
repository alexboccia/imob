import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_IMOVEL_LABEL } from "@/lib/format";
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
  ] = await Promise.all([
    prisma.imovel.count({ where: { status: "DISPONIVEL" } }),
    prisma.pessoa.count({
      where: { papeis: { has: "LEAD" }, criadoEm: { gte: inicioDoMes } },
    }),
    prisma.negocio.count({ where: { fechadoEm: { gte: inicioDoMes } } }),
    prisma.imovel.count({
      where: {
        status: "DISPONIVEL",
        publicadoEm: {
          lt: noventaDiasAtras,
        },
      },
    }),
    prisma.pessoa.findMany({
      where: { papeis: { has: "LEAD" }, criadoEm: { gte: seisMesesAtras } },
      select: { criadoEm: true },
    }),
    prisma.negocio.findMany({
      where: { fechadoEm: { gte: seisMesesAtras } },
      select: { fechadoEm: true },
    }),
    prisma.imovel.groupBy({ by: ["tipo"], _count: true }),
    prisma.imovel.groupBy({ by: ["bairro"], _count: true }),
    prisma.imovel.groupBy({ by: ["status"], _count: true }),
  ]);

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
    const chave = chaveMes(lead.criadoEm);
    if (contagemLeads.has(chave)) {
      contagemLeads.set(chave, (contagemLeads.get(chave) ?? 0) + 1);
    }
  }

  const contagemNegocios = new Map(meses.map((m) => [m.chave, 0]));
  for (const negocio of negociosRecentes) {
    if (!negocio.fechadoEm) continue;
    const chave = chaveMes(negocio.fechadoEm);
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
    .map((g) => ({ nome: g.tipo, total: g._count }))
    .sort(porTotal)
    .slice(0, 8);

  const composicaoBairro: ItemComposicao[] = porBairro
    .map((g) => ({ nome: g.bairro, total: g._count }))
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

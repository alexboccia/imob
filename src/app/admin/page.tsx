import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const noventaDiasAtras = new Date();
  noventaDiasAtras.setDate(noventaDiasAtras.getDate() - 90);

  const [
    imoveisAtivos,
    leadsNoMes,
    negociosNoMes,
    imoveisParados,
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
  ]);

  const cards = [
    { label: "Imóveis disponíveis", valor: imoveisAtivos },
    { label: "Novos leads no mês", valor: leadsNoMes },
    { label: "Negócios fechados no mês", valor: negociosNoMes },
    { label: "Imóveis parados há +90 dias", valor: imoveisParados },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="border rounded-lg p-5">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-3xl font-semibold mt-1">{card.valor}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

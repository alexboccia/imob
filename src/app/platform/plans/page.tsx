import Link from "next/link";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Somente leitura no MVP — editar Plan/PlanModule/PlanLimit afeta todas as
// organizations daquele plano de uma vez, risco desproporcional ao valor
// agora (decisão #8 do plano). Atribuir um plano EXISTENTE a uma
// Organization acontece em Organization Details.
export default async function PlatformPlansPage() {
  await requirePlatformOperator();

  const planos = await prisma.plan.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { organizations: true } } },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Plans</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {planos.map((plano) => (
          <Link key={plano.id} href={`/platform/plans/${plano.id}`}>
            <Card className="hover:border-slate-400 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold">{plano.name}</h2>
                  {!plano.active && <Badge variant="secondary">Inativo</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {plano.priceMonthlyCents != null
                    ? `R$ ${(plano.priceMonthlyCents / 100).toLocaleString("pt-BR")}/mês`
                    : "Sem preço definido"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {plano._count.organizations} organization
                  {plano._count.organizations === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

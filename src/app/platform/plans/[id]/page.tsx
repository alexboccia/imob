import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function PlatformPlanDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformOperator();
  const { id } = await params;

  const plano = await prisma.plan.findUnique({
    where: { id },
    include: {
      planModules: { include: { module: true }, orderBy: { module: { name: "asc" } } },
      planLimits: { orderBy: { feature: "asc" } },
      _count: { select: { organizations: true } },
    },
  });
  if (!plano) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{plano.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {plano.code} ·{" "}
            {plano.priceMonthlyCents != null
              ? `R$ ${(plano.priceMonthlyCents / 100).toLocaleString("pt-BR")}/mês`
              : "Sem preço definido"}
            {plano.isTrial && plano.trialDays != null && ` · trial ${plano.trialDays} dias`} ·{" "}
            {plano._count.organizations} organization
            {plano._count.organizations === 1 ? "" : "s"}
            {!plano.active && " · inativo"}
          </p>
        </div>
        <Link href={`/platform/plans/${plano.id}/editar`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Editar plano
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Módulos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {plano.planModules.map((pm) => (
              <Badge
                key={pm.id}
                variant={pm.enabled ? "default" : "secondary"}
                className={pm.enabled ? "" : "text-muted-foreground"}
              >
                {pm.module.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limites</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {plano.planLimits.map((limite) => (
              <div
                key={limite.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="text-muted-foreground">{limite.feature}</span>
                <span className="font-medium">
                  {limite.limit === null ? "ilimitado" : limite.limit}
                </span>
              </div>
            ))}
            {plano.planLimits.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                Nenhum limite definido — tudo ilimitado.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

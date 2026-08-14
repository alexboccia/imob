import Link from "next/link";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Fase P.9: ordem comercial explícita — nunca ordem incidental do banco
// (nome/code alfabético colocaria PREMIUM antes de PRO/STARTER). Um
// código fora desta lista (nunca deveria acontecer, mas defensivo) vai
// pro fim, ordenado por code entre si.
const ORDEM_PLANOS = ["STARTER", "BASICO", "PRO", "PREMIUM"];

function ordenarPlanos<T extends { code: string }>(planos: readonly T[]): T[] {
  return [...planos].sort((a, b) => {
    const posA = ORDEM_PLANOS.indexOf(a.code);
    const posB = ORDEM_PLANOS.indexOf(b.code);
    if (posA === -1 && posB === -1) return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    if (posA === -1) return 1;
    if (posB === -1) return -1;
    return posA - posB;
  });
}

export default async function PlatformPlansPage() {
  await requirePlatformOperator();

  // _count batched (1 query, sem N+1) — mesmo padrão já usado antes da
  // P.9, agora também trazendo planLimits pra exibir os 4 limites no
  // card.
  const planosBrutos = await prisma.plan.findMany({
    include: { _count: { select: { organizations: true } }, planLimits: true },
  });
  const planos = ordenarPlanos(planosBrutos);

  const limite = (planLimits: { feature: string; limit: number | null }[], feature: string) =>
    planLimits.find((l) => l.feature === feature)?.limit;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Plans</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {planos.map((plano) => (
          <Card key={plano.id} className="hover:border-slate-400 transition-colors">
            <CardContent className="pt-6 space-y-2">
              <div className="flex items-center justify-between">
                <Link href={`/platform/plans/${plano.id}`} className="font-semibold hover:underline">
                  {plano.name}
                </Link>
                {!plano.active && <Badge variant="secondary">Inativo</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {plano.priceMonthlyCents != null
                  ? `R$ ${(plano.priceMonthlyCents / 100).toLocaleString("pt-BR")}/mês`
                  : "Sem preço definido"}
                {plano.isTrial && plano.trialDays != null && ` · trial ${plano.trialDays} dias`}
              </p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Imóveis ativos: {limite(plano.planLimits, "PROPERTIES") ?? "ilimitado"}</p>
                <p>Fotos por imóvel: {limite(plano.planLimits, "PHOTOS_PER_PROPERTY") ?? "ilimitado"}</p>
                <p>Usuários: {limite(plano.planLimits, "USERS") ?? "ilimitado"}</p>
                <p>Clientes CRM: {limite(plano.planLimits, "CRM_CLIENTS") ?? "ilimitado"}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {plano._count.organizations} organization
                {plano._count.organizations === 1 ? "" : "s"}
              </p>
              <Link
                href={`/platform/plans/${plano.id}/editar`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1")}
              >
                Editar plano
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

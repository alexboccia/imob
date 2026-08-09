import { requirePlatformOperator } from "@/lib/platform/auth";
import { prisma, prismaPlatform } from "@/lib/prisma";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

function CardEstatistica({ titulo, valor }: { titulo: string; valor: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{valor}</p>
      </CardContent>
    </Card>
  );
}

export default async function PlatformDashboardPage() {
  await requirePlatformOperator();

  // Organization/User/Plan não são tenant-scoped — consultam direto via
  // `prisma`, sem bypass nenhum. Único uso de `prismaPlatform` (client sem
  // a extension de tenant-scoping) é a contagem GLOBAL de Property (é
  // tenant-scoped, sem filtro de organização não funcionaria com `prisma`
  // normal) — ver decisão #4 do plano.
  const [
    totalOrganizations,
    organizationsAtivas,
    totalUsuarios,
    totalImoveis,
    planos,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { active: true } }),
    prisma.user.count(),
    prismaPlatform.property.count(),
    prisma.plan.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { organizations: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const organizationsSuspensas = totalOrganizations - organizationsAtivas;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <CardEstatistica titulo="Total de Organizations" valor={totalOrganizations} />
        <CardEstatistica titulo="Organizations ativas" valor={organizationsAtivas} />
        <CardEstatistica titulo="Organizations suspensas" valor={organizationsSuspensas} />
        <CardEstatistica titulo="Total de usuários" valor={totalUsuarios} />
        <CardEstatistica titulo="Total de imóveis" valor={totalImoveis} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuição por plano</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {planos.map((plano) => (
              <div
                key={plano.id}
                className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0 last:pb-0"
              >
                <span>{plano.name}</span>
                <span className="font-medium">
                  {plano._count.organizations} organization
                  {plano._count.organizations === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

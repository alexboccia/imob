import { notFound } from "next/navigation";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";
import { FEATURE_PROPERTIES, FEATURE_USERS } from "@/lib/entitlements";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { AlterarPlanoForm } from "./AlterarPlanoForm";
import { suspenderOrganization, ativarOrganization } from "./actions";

function LinhaUso({
  label,
  total,
  limite,
}: {
  label: string;
  total: number;
  limite: number | null;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {total} / {limite === null ? "ilimitado" : limite}
      </span>
    </div>
  );
}

export default async function OrganizationDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformOperator();
  const { id } = await params;

  // Organization não é tenant-scoped (consulta direto via `prisma`). As
  // contagens abaixo são em models tenant-scoped (Property,
  // OrganizationMember não é tenant-scoped mas filtra por organizationId
  // mesmo assim por clareza) — como o `where` já inclui organizationId
  // explícito, a extension de tenant-scoping não interfere, sem precisar
  // de withOrganization() nem bypass.
  const [organization, propertiesCount, activeMembersCount, planos] = await Promise.all([
    prisma.organization.findUnique({
      where: { id },
      include: {
        plan: {
          include: {
            planModules: { include: { module: true } },
            planLimits: true,
          },
        },
        members: {
          include: { user: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.property.count({ where: { organizationId: id } }),
    prisma.organizationMember.count({ where: { organizationId: id, status: "ACTIVE" } }),
    prisma.plan.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!organization) notFound();

  const limitePropriedades =
    organization.plan.planLimits.find((l) => l.feature === FEATURE_PROPERTIES)?.limit ?? null;
  const limiteUsuarios =
    organization.plan.planLimits.find((l) => l.feature === FEATURE_USERS)?.limit ?? null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{organization.name}</h1>
          {organization.active ? (
            <Badge className="bg-green-600 text-white">Ativa</Badge>
          ) : (
            <Badge variant="destructive">Suspensa</Badge>
          )}
          {organization.active ? (
            <form
              action={async () => {
                "use server";
                await suspenderOrganization(organization.id);
              }}
            >
              <Button type="submit" variant="destructive" size="sm">
                Suspender
              </Button>
            </form>
          ) : (
            <form
              action={async () => {
                "use server";
                await ativarOrganization(organization.id);
              }}
            >
              <Button type="submit" size="sm">
                Ativar
              </Button>
            </form>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {organization.slug} · criada em{" "}
          {organization.createdAt.toLocaleDateString("pt-BR")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plano</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AlterarPlanoForm
            organizationId={organization.id}
            planoAtualId={organization.planId}
            planos={planos}
          />
          <div className="space-y-1.5 pt-2 border-t">
            <LinhaUso label="Usuários ativos" total={activeMembersCount} limite={limiteUsuarios} />
            <LinhaUso label="Imóveis" total={propertiesCount} limite={limitePropriedades} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Módulos habilitados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {organization.plan.planModules.map((pm) => (
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
          <CardTitle className="text-base">Membros ({organization.members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {organization.members.map((membro) => (
              <div
                key={membro.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{membro.user.name}</p>
                  <p className="text-muted-foreground">{membro.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{membro.role}</Badge>
                  <Badge
                    variant={membro.status === "ACTIVE" ? "default" : "secondary"}
                  >
                    {membro.status}
                  </Badge>
                </div>
              </div>
            ))}
            {organization.members.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                Nenhum membro ainda.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

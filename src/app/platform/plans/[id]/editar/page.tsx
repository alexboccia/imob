import { notFound } from "next/navigation";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";
import { reaisDeCentavos } from "@/lib/plan-schema";
import { EditarPlanoForm } from "./EditarPlanoForm";

export default async function EditarPlanoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOperator();
  const { id } = await params;

  const plano = await prisma.plan.findUnique({
    where: { id },
    include: {
      planLimits: true,
      _count: { select: { organizations: true } },
    },
  });
  if (!plano) notFound();

  const limite = (feature: string) => plano.planLimits.find((l) => l.feature === feature)?.limit ?? null;

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Editar {plano.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{plano.code}</p>
      </div>
      <EditarPlanoForm
        planId={plano.id}
        precoAtualReais={reaisDeCentavos(plano.priceMonthlyCents)}
        isTrialAtual={plano.isTrial}
        trialDaysAtual={plano.trialDays}
        activeAtual={plano.active}
        limitesAtuais={{
          PROPERTIES: limite("PROPERTIES"),
          PHOTOS_PER_PROPERTY: limite("PHOTOS_PER_PROPERTY"),
          USERS: limite("USERS"),
          CRM_CLIENTS: limite("CRM_CLIENTS"),
        }}
        quantidadeOrganizacoes={plano._count.organizations}
      />
    </div>
  );
}

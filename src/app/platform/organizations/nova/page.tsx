import { requirePlatformOperator } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";
import { CriarOrganizationForm } from "./CriarOrganizationForm";

export default async function NovaOrganizationPage() {
  await requirePlatformOperator();

  const planos = await prisma.plan.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold mb-6">Nova organization</h1>
      <CriarOrganizationForm planos={planos} />
    </div>
  );
}

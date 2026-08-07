import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cidade = searchParams.get("cidade")?.trim();

  if (!cidade) {
    return NextResponse.json({ bairros: [] });
  }

  const organizationId = await requireOrganizationId();
  const imoveis = await withOrganization(organizationId, () =>
    prisma.property.findMany({
      where: { organizationId, city: { equals: cidade, mode: "insensitive" } },
      select: { neighborhood: true },
      distinct: ["neighborhood"],
    })
  );

  const bairros = imoveis
    .map((i) => i.neighborhood)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  return NextResponse.json({ bairros });
}

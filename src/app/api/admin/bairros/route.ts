import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const imoveis = await prisma.imovel.findMany({
    where: { cidade: { equals: cidade, mode: "insensitive" } },
    select: { bairro: true },
    distinct: ["bairro"],
  });

  const bairros = imoveis
    .map((i) => i.bairro)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  return NextResponse.json({ bairros });
}

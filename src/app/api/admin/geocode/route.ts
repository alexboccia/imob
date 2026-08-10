import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { siteConfig } from "@/lib/site-config";
import { prisma } from "@/lib/prisma";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  const organizationId = await requireOrganizationId();

  const { searchParams } = new URL(request.url);
  const endereco = searchParams.get("endereco")?.trim();
  if (!endereco) {
    return NextResponse.json({ erro: "Endereço ausente" }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(
    endereco
  )}`;

  // O Nominatim exige um identificador válido (política de uso). O domínio
  // "example.com" (valor padrão até cadastrar um e-mail em Configurações) é
  // bloqueado por eles, então usamos um identificador genérico nesse caso.
  const [configContato, organization] = await Promise.all([
    withOrganization(organizationId, () => buscarConfiguracaoContato(organizationId)),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);
  const nomeOrganizacao = organization?.name ?? siteConfig.nome;
  const emailConfigurado = configContato.email || siteConfig.emailContato;
  const contatoValido =
    emailConfigurado && emailConfigurado !== "contato@example.com"
      ? emailConfigurado
      : null;
  const userAgent = contatoValido
    ? `${nomeOrganizacao} (${contatoValido})`
    : `${nomeOrganizacao} - sistema de gestão imobiliária`;

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
      },
    });
  } catch {
    return NextResponse.json(
      { erro: "Falha ao buscar coordenadas" },
      { status: 502 }
    );
  }

  if (!resposta.ok) {
    return NextResponse.json(
      { erro: "Falha ao buscar coordenadas" },
      { status: 502 }
    );
  }

  const dados = (await resposta.json()) as { lat: string; lon: string }[];
  if (dados.length === 0) {
    return NextResponse.json(
      { erro: "Endereço não encontrado. Ajuste manualmente no mapa." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    latitude: Number(dados[0].lat),
    longitude: Number(dados[0].lon),
  });
}

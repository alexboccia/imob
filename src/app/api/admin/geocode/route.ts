import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { siteConfig } from "@/lib/site-config";
import { prisma } from "@/lib/prisma";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";

function aguardar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ParametrosEstruturados = {
  street?: string;
  county?: string;
  city?: string;
  state?: string;
};

// Busca estruturada (street/county/city/state) em vez de texto livre num
// único `q=` — testado empiricamente contra o Nominatim real: pra vários
// endereços brasileiros (ex.: ruas com nome composto, tipo "Praça ..."), a
// busca estruturada acha o logradouro certo onde a busca por texto livre
// combinando tudo numa string só retorna vazio ou casa com resultado errado
// (ex.: outro lugar de mesmo nome em cidade diferente).
async function buscarNoNominatim(
  parametros: ParametrosEstruturados,
  userAgent: string
): Promise<{ lat: string; lon: string }[] | null> {
  const qs = new URLSearchParams({
    format: "json",
    limit: "1",
    countrycodes: "br",
    ...Object.fromEntries(
      Object.entries(parametros).filter(([, valor]) => valor)
    ),
  });
  let resposta: Response;
  try {
    resposta = await fetch(
      `https://nominatim.openstreetmap.org/search?${qs.toString()}`,
      { headers: { "User-Agent": userAgent } }
    );
  } catch {
    return null;
  }
  if (!resposta.ok) return null;
  return (await resposta.json()) as { lat: string; lon: string }[];
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  const organizationId = await requireOrganizationId();

  const { searchParams } = new URL(request.url);
  const logradouro = searchParams.get("logradouro")?.trim() ?? "";
  const numero = searchParams.get("numero")?.trim() ?? "";
  const bairro = searchParams.get("bairro")?.trim() ?? "";
  const cidade = searchParams.get("cidade")?.trim() ?? "";
  const estado = searchParams.get("estado")?.trim() ?? "";

  if (!cidade || !estado) {
    return NextResponse.json(
      { erro: "Preencha ao menos o bairro e a cidade." },
      { status: 400 }
    );
  }

  // Do mais específico pro mais genérico. O OpenStreetMap tem cobertura
  // desigual pelo Brasil — muita rua/bairro menor ou mais novo não está
  // indexado, o que faz o nível mais específico retornar vazio mesmo o
  // endereço existindo de verdade. Cada tentativa cai pro nível anterior
  // até achar pelo menos a cidade — só falha de verdade se nem a cidade for
  // reconhecida. O usuário sempre pode ajustar manualmente no mapa depois.
  // Importante: `street` e `county` (bairro) juntos na mesma busca
  // super-restringem o Nominatim e derrubam resultados que existem — testado
  // empiricamente, a mesma rua só aparece quando "county" não é enviado
  // junto. Por isso nunca combinamos os dois no mesmo candidato.
  const rua = logradouro && numero ? `${logradouro}, ${numero}` : logradouro;
  const candidatos: ParametrosEstruturados[] = [
    { street: rua, city: cidade, state: estado },
    { street: logradouro, city: cidade, state: estado },
    { county: bairro, city: cidade, state: estado },
    { city: cidade, state: estado },
  ].filter((c) => c.street || c.county || c.city);

  // Remove tentativas idênticas (ex.: sem número informado, a 1ª e a 2ª
  // ficam iguais).
  const vistos = new Set<string>();
  const tentativas = candidatos.filter((c) => {
    const chave = JSON.stringify(c);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

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

  let dados: { lat: string; lon: string }[] | null = null;
  for (let i = 0; i < tentativas.length; i++) {
    if (i > 0) {
      // Respeita o limite de 1 req/s do Nominatim entre tentativas.
      await aguardar(1100);
    }
    dados = await buscarNoNominatim(tentativas[i], userAgent);
    if (dados === null) {
      return NextResponse.json(
        { erro: "Falha ao buscar coordenadas" },
        { status: 502 }
      );
    }
    if (dados.length > 0) break;
  }

  if (!dados || dados.length === 0) {
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

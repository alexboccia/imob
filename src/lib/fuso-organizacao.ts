import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tagFuso } from "@/lib/cache-tags";
import { resolverFuso } from "@/lib/fuso-horario";

// Leitura do fuso horário comercial da organização (Fase 18).
//
// Separado de src/lib/fuso-horario.ts de propósito: aquele arquivo é puro
// (testável sem Prisma, sem Next, sem banco) e este é o único que toca a
// infraestrutura. Nenhum helper de calendário busca fuso sozinho.
//
// PERFORMANCE: resolvido UMA vez por request/carregamento de tela e
// passado adiante como string — nunca uma consulta por ScheduledActivity,
// por Interaction ou por card. Zero N+1 por construção: quem precisa do
// fuso recebe a string já resolvida.
//
// CACHE: muda raríssimo (só quando um OWNER/ADMIN salva Configurações) e
// é lido em toda tela autenticada. Cacheado com tag por organização e
// invalidado explicitamente pela action que grava — trocar o fuso reflete
// na hora, sem deploy. organizationId entra como ARGUMENTO da função
// cacheada (não capturado por closure): é isso que faz o Next derivar uma
// entrada por organização, nunca a mesma chave para dois tenants.
async function buscarFusoSemCache(organizationId: string): Promise<string> {
  const organizacao = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  // Organização inexistente e organização sem fuso configurado caem no
  // mesmo fallback explícito (UTC) — nunca um fuso adivinhado, nunca o
  // fuso do processo Node, nunca o do navegador.
  return resolverFuso(organizacao?.timezone);
}

// Valor BRUTO do campo, sem fallback (Fase 19): null = a organização
// nunca escolheu um fuso. Existe separado de buscarFusoOrganizacao
// porque quem avisa precisa distinguir "usa UTC porque ninguém
// escolheu" de "escolheu UTC" — o efetivo é o mesmo, o fato não é.
// Mesma entrada de cache e mesma tag: uma consulta por request.
async function buscarFusoConfiguradoSemCache(organizationId: string): Promise<string | null> {
  const organizacao = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  return organizacao?.timezone ?? null;
}

export async function buscarFusoConfigurado(organizationId: string): Promise<string | null> {
  return unstable_cache(buscarFusoConfiguradoSemCache, ["fuso-configurado", organizationId], {
    tags: [tagFuso(organizationId)],
  })(organizationId);
}

export async function buscarFusoOrganizacao(organizationId: string): Promise<string> {
  return unstable_cache(buscarFusoSemCache, ["fuso-organizacao", organizationId], {
    tags: [tagFuso(organizationId)],
  })(organizationId);
}

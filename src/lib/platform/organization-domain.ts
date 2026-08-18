import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizarHostname, hostnameReservado } from "@/lib/platform/hostname";

// Mesmo padrão de gerarTokenConvite (src/lib/platform/invite.ts) — 192
// bits de entropia, nunca reaproveitado como segredo de sessão. V1 não
// verifica nada automaticamente com isto (ver P.10.3.3), só guarda uma
// base pronta pra uma futura verificação por DNS TXT sem precisar de
// migration nova depois.
export function gerarTokenVerificacaoDominio(): string {
  return randomBytes(24).toString("base64url");
}

// Nunca resolve domínio PENDING/FAILED/DISABLED como tenant ativo (ver
// P.10.2) — só VERIFIED e ACTIVE.
const STATUS_RESOLVAVEIS = new Set(["VERIFIED", "ACTIVE"]);

// Resolve um hostname JÁ NORMALIZADO (normalizarHostname) pro slug da
// Organization dona dele — usado pelo tenant resolver (src/proxy.ts) ANTES
// de qualquer contexto de tenant existir, exatamente como
// verificarConvite (src/lib/platform/invite.ts) faz pra OwnerInviteToken:
// usa o `prisma` normal (OrganizationDomain está deliberadamente FORA de
// TENANT_SCOPED_MODELS, ver comentário no schema), sem bypass.
//
// Suspensão (Organization.active=false) NÃO é checada aqui de propósito
// — o layout de [orgSlug] já trata isso com a página neutra existente
// (src/app/[orgSlug]/layout.tsx), então este resolver só cuida de
// hostname→slug, sem duplicar essa lógica.
export async function resolverOrgSlugPorHostname(hostname: string): Promise<string | null> {
  const registro = await prisma.organizationDomain.findUnique({
    where: { hostname },
    select: { status: true, organization: { select: { slug: true } } },
  });
  if (!registro || !STATUS_RESOLVAVEIS.has(registro.status)) return null;
  return registro.organization.slug;
}

// =====================================================================
// Correção AU (auditoria pré-commit P.10) — canonical/sitemap sob custom
// domain. Direção OPOSTA de resolverOrgSlugPorHostname acima (aqui:
// Organization → hostname, pra montar URL absoluta de SEO; lá: hostname →
// Organization, pra rotear tenant). Deliberadamente só ACTIVE (nunca
// VERIFIED) — VERIFIED é "DNS/posse confirmados administrativamente,
// ainda não necessariamente publicado como URL pública" (ver
// OrganizationDomainStatus no schema); ACTIVE é "publicado de fato". O
// tenant resolver (src/proxy.ts) aceita os dois porque já é seguro servir
// o tenant assim que o operador confirma — mas SEO é uma declaração
// pública de qual é A URL canônica, e essa promessa só deve ser feita
// depois de ACTIVE.
export async function buscarHostnameCustomAtivo(organizationId: string): Promise<string | null> {
  const dominio = await prisma.organizationDomain.findFirst({
    where: { organizationId, type: "CUSTOM", status: "ACTIVE" },
    select: { hostname: true },
  });
  return dominio?.hostname ?? null;
}

export type OrigemPublicacao =
  | { tipo: "global" }
  | { tipo: "custom"; hostname: string; organizationId: string }
  | { tipo: "desconhecido" };

// Resolve, a partir de um Host bruto (ex: vindo de headers().get("host")
// dentro de sitemap.ts/robots.ts — "special Route Handlers" que suportam
// Request-time APIs, ver doc oficial de sitemap.js), qual é a origem de
// publicação da requisição atual. Mesma ordem de resolução e mesma
// decisão de header confiável do proxy (src/proxy.ts): só o Host, nunca
// X-Forwarded-Host. "desconhecido" cobre tanto host malformado quanto
// host não reservado sem nenhum OrganizationDomain ACTIVE correspondente
// — quem chama nunca deve tratar "desconhecido" como "global" (nunca
// expor o sitemap/robots da plataforma inteira sob um host não
// verificado, ver P.10.16 risco AU9).
export async function resolverOrigemPublicacao(hostBruto: string | null): Promise<OrigemPublicacao> {
  if (!hostBruto) return { tipo: "desconhecido" };

  const host = normalizarHostname(hostBruto);
  if (!host) return { tipo: "desconhecido" };

  if (hostnameReservado(host)) return { tipo: "global" };

  const dominio = await prisma.organizationDomain.findFirst({
    where: { hostname: host, type: "CUSTOM", status: "ACTIVE" },
    select: { organizationId: true },
  });
  if (!dominio) return { tipo: "desconhecido" };

  return { tipo: "custom", hostname: host, organizationId: dominio.organizationId };
}

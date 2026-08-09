// PUBLIC_ORG_SLUG também é usado por src/lib/tenant.ts (getOrganizationBySlug
// não decide "qual é a org padrão", só resolve por slug) — mantido aqui
// porque é o helper de apresentação/URL que precisa decidir se um slug leva
// prefixo ou não.
const PUBLIC_ORG_SLUG = process.env.PUBLIC_ORG_SLUG ?? "boccia";

export function getSiteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// orgSlug aqui é só detalhe de apresentação (decide se um link leva prefixo
// de organização ou não) — nunca usar o retorno desta função como
// substituto de validação de organização. Ver plano, seção "Modelo de
// isolamento e fronteira de segurança".
export function resolverBasePath(orgSlug: string): string {
  return orgSlug === PUBLIC_ORG_SLUG ? "" : `/${orgSlug}`;
}

export { PUBLIC_ORG_SLUG };

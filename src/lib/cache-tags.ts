// Geradores de tag de cache — centralizados aqui pra garantir que toda
// chave/tag de cache de dado público inclua o organizationId (nunca cachear
// dado de uma organização sob a tag/chave de outra) e pra manter as
// actions que invalidam em sincronia com quem lê.
export function tagConfiguracao(organizationId: string): string {
  return `org:${organizationId}:config`;
}

export function tagFacetas(organizationId: string): string {
  return `org:${organizationId}:facetas`;
}

export function tagBranding(organizationId: string): string {
  return `org:${organizationId}:branding`;
}

// Fase 18 — tag própria para o fuso horário porque ele mora em
// Organization, não em OrganizationSettings/Branding: reaproveitar
// tagConfiguracao faria uma troca de logotipo invalidar o fuso e
// vice-versa. Invalidada em salvarFusoOrganizacao.
export function tagFuso(organizationId: string): string {
  return `org:${organizationId}:fuso`;
}

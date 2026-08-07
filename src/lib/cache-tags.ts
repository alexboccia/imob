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

// Conjuntos de papéis autorizados por área sensível do painel. Centralizado
// aqui para que a regra de "quem pode fazer o quê" tenha um único lugar de
// verdade — evita checagens de papel divergentes espalhadas pelas actions.
export const PAPEIS_GESTAO_CONFIGURACOES: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
]);

export const PAPEIS_GESTAO_CATALOGOS: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
]);

export const PAPEIS_GESTAO_USUARIOS: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
]);

export function temPapel(
  role: string | undefined,
  permitidos: ReadonlySet<string>
): boolean {
  return !!role && permitidos.has(role);
}

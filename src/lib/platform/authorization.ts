// Papéis de PLATAFORMA (PlatformOperator) — não confundir com
// @/lib/authorization.ts (papéis de OrganizationMember, escopados por
// tenant). Mesmo padrão, identidade diferente.
//
// MVP usa só SUPER_ADMIN. PLATFORM_ADMIN/PLATFORM_SUPPORT já existem no
// enum PlatformRole (schema), preparados para permissões mais granulares
// no futuro, mas sem UI de permissão diferenciada ainda — todo Set abaixo
// só contém SUPER_ADMIN por enquanto.
export const PAPEIS_PLATAFORMA_TUDO: ReadonlySet<string> = new Set(["SUPER_ADMIN"]);

export function temPapelPlataforma(
  role: string | undefined,
  permitidos: ReadonlySet<string>
): boolean {
  return !!role && permitidos.has(role);
}

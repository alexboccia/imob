import { AsyncLocalStorage } from "node:async_hooks";

type TenantStore = { organizationId: string };

const storage = new AsyncLocalStorage<TenantStore>();

// Cada página/action de entrada (não cada query individual) deve envolver seu
// corpo nesta função, logo após resolver o organizationId (via
// requireOrganizationId ou getPublicOrganizationId, em @/lib/tenant). A
// extension do Prisma Client (@/lib/prisma) lê esse contexto para injetar
// organizationId automaticamente em toda query dos models tenant-aware.
export function withOrganization<T>(
  organizationId: string,
  fn: () => Promise<T> | T
): Promise<T> | T {
  return storage.run({ organizationId }, fn);
}

export function getCurrentOrganizationId(): string | undefined {
  return storage.getStore()?.organizationId;
}

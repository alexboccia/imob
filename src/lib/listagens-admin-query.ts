// Construção do `where` das listagens administrativas, extraída dos
// page.tsx pra ser testável sem precisar de um banco real — o ponto
// central de verificação é que `organizationId` está sempre presente e
// nunca é sobrescrito por filtro/busca do usuário (isolamento de tenant).
import type { Prisma } from "@/generated/prisma/client";

export function construirWhereImoveis(params: {
  organizationId: string;
  busca: string;
  statusFiltro?: string;
}): Prisma.PropertyWhereInput {
  const { organizationId, busca, statusFiltro } = params;
  // "".replace(/\D/g,"") -> "" -> Number("") é 0, não NaN — sem o dígitos
  // ? ... : NaN, uma busca só de texto (sem nenhum número) incluiria por
  // engano a cláusula { code: 0 } no OR.
  const digitosBusca = busca.replace(/\D/g, "");
  const codigoBusca = digitosBusca ? Number(digitosBusca) : NaN;

  return {
    organizationId,
    ...(statusFiltro ? { status: statusFiltro as Prisma.PropertyWhereInput["status"] } : {}),
    ...(busca
      ? {
          OR: [
            { title: { contains: busca, mode: "insensitive" } },
            { city: { contains: busca, mode: "insensitive" } },
            { neighborhood: { contains: busca, mode: "insensitive" } },
            { type: { contains: busca, mode: "insensitive" } },
            ...(Number.isInteger(codigoBusca) ? [{ code: codigoBusca }] : []),
          ],
        }
      : {}),
  };
}

export function construirWhereClientes(params: {
  organizationId: string;
  busca: string;
  estagioFiltro?: string;
}): Prisma.PersonWhereInput {
  const { organizationId, busca, estagioFiltro } = params;

  return {
    organizationId,
    ...(estagioFiltro
      ? { pipelineStage: estagioFiltro as Prisma.PersonWhereInput["pipelineStage"] }
      : {}),
    ...(busca
      ? {
          OR: [
            { name: { contains: busca, mode: "insensitive" } },
            { email: { contains: busca, mode: "insensitive" } },
            { phone: { contains: busca, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export function construirWhereUsuarios(params: {
  organizationId: string;
  busca: string;
  papelFiltro?: string;
}): Prisma.OrganizationMemberWhereInput {
  const { organizationId, busca, papelFiltro } = params;

  return {
    organizationId,
    ...(papelFiltro ? { role: papelFiltro as Prisma.OrganizationMemberWhereInput["role"] } : {}),
    ...(busca
      ? {
          user: {
            OR: [
              { name: { contains: busca, mode: "insensitive" } },
              { email: { contains: busca, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
}

import { cache } from "react";
import { prisma } from "@/lib/prisma";

// =======================================================================
// Organizações acessíveis por uma identidade (Fase 26)
// =======================================================================
// A Fase 25 tornou multi-org real (convidar quem já tem conta cria um
// segundo vínculo) e resolveu apenas o DETERMINISMO do login: entra-se
// sempre no vínculo mais antigo. Isso deixou de bastar — quem pertence a
// duas imobiliárias não tinha como chegar à segunda sem que um
// administrador suspendesse a primeira.
//
// O que conta como acessível, e por quê:
//
//   membership ACTIVE  — INVITED ainda não aceitou; SUSPENDED teve o
//                        acesso retirado. Nenhum dos dois é uma opção
//                        que faça sentido oferecer.
//   organização active — organização suspensa pela plataforma não
//                        aparece como destino: entrar nela só levaria à
//                        tela de suspensão.
//
// Uma consulta só, com o papel junto: o switcher precisa do nome e do
// papel de cada opção, e buscá-los depois seria um N+1 por linha.

export type OrganizacaoAcessivel = {
  organizationId: string;
  membershipId: string;
  nome: string;
  slug: string;
  papel: string;
};

export const listarOrganizacoesAcessiveis = cache(
  async (userId: string): Promise<OrganizacaoAcessivel[]> => {
    const vinculos = await prisma.organizationMember.findMany({
      where: {
        userId,
        status: "ACTIVE",
        organization: { active: true },
      },
      // MESMA ordenação do login (auth.ts): o vínculo mais antigo é o
      // primeiro da lista e é onde a pessoa entra por padrão. Duas
      // ordens diferentes fariam o topo da lista discordar de onde a
      // sessão realmente está.
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        organizationId: true,
        organization: { select: { name: true, slug: true } },
      },
    });

    return vinculos.map((vinculo) => ({
      organizationId: vinculo.organizationId,
      membershipId: vinculo.id,
      nome: vinculo.organization.name,
      slug: vinculo.organization.slug,
      papel: vinculo.role,
    }));
  }
);

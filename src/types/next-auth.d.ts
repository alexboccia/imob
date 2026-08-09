import type { DefaultSession } from "next-auth";

// Dois tipos de identidade compartilham este mesmo shape, porque a
// augmentation do módulo "next-auth" é global (não por-instância) — a
// instância de /app preenche organizationId/organizationMemberId/role, a
// de /platform preenche platformOperatorId/platformRole. Nenhum código
// deve inferir o tipo de identidade a partir de qual campo está presente;
// use sempre a função de guarda correta (requireOrganizationId() ou
// requirePlatformOperator()), que revalida no banco, não confia só no JWT.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId?: string;
      organizationMemberId?: string;
      role?: string;
      platformOperatorId?: string;
      platformRole?: string;
    } & DefaultSession["user"];
  }

  interface User {
    organizationId?: string;
    organizationMemberId?: string;
    role?: string;
    platformOperatorId?: string;
    platformRole?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId?: string;
    organizationMemberId?: string;
    role?: string;
    platformOperatorId?: string;
    platformRole?: string;
  }
}

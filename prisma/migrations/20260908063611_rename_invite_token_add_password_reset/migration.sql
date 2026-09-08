-- =====================================================================
-- Fase 25 — ciclo de acesso
-- =====================================================================
-- ESCRITA À MÃO. O `prisma migrate dev` gerou DROP TABLE +
-- CREATE TABLE para a renomeação, o que APAGARIA todo convite de OWNER
-- ainda pendente. Renomear preserva as linhas: nenhum convite em voo é
-- invalidado por este deploy.

-- 1) owner_invite_tokens -> invite_tokens (mesma tabela, nome honesto)
ALTER TABLE "owner_invite_tokens" RENAME TO "invite_tokens";

-- Constraints e índices acompanham a tabela no rename, mas mantendo os
-- nomes antigos. Renomeados para o que o Prisma espera, senão o próximo
-- `migrate diff` acusaria drift eterno.
ALTER TABLE "invite_tokens" RENAME CONSTRAINT "owner_invite_tokens_pkey" TO "invite_tokens_pkey";
ALTER TABLE "invite_tokens" RENAME CONSTRAINT "owner_invite_tokens_userId_fkey" TO "invite_tokens_userId_fkey";
ALTER TABLE "invite_tokens" RENAME CONSTRAINT "owner_invite_tokens_organizationId_fkey" TO "invite_tokens_organizationId_fkey";
ALTER INDEX "owner_invite_tokens_tokenHash_key" RENAME TO "invite_tokens_tokenHash_key";
ALTER INDEX "owner_invite_tokens_userId_idx" RENAME TO "invite_tokens_userId_idx";

-- 2) Marco da última troca de senha. Nullable e sem default: null é
-- "nunca trocou", e nenhuma sessão existente é invalidada pelo deploy.
ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- 3) Recuperação de senha — tabela nova, nada existente é tocado.
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

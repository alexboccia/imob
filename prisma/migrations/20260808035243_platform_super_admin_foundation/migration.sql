/*
  Warnings:

  - You are about to drop the `configuracao_contato` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `usuarios` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "PlatformRole" ADD VALUE 'SUPER_ADMIN';

-- DropIndex
DROP INDEX "caracteristicas_opcoes_categoria_nome_key";

-- DropIndex
DROP INDEX "imoveis_codigo_key";

-- DropIndex
DROP INDEX "tipos_imovel_opcoes_categoria_nome_key";

-- AlterTable
ALTER TABLE "deal_people" RENAME CONSTRAINT "negocios_pessoas_pkey" TO "deal_people_pkey";

-- AlterTable
ALTER TABLE "deals" RENAME CONSTRAINT "negocios_pkey" TO "deals_pkey";

-- AlterTable
ALTER TABLE "feature_options" RENAME CONSTRAINT "caracteristicas_opcoes_pkey" TO "feature_options_pkey";

-- AlterTable
ALTER TABLE "interactions" RENAME CONSTRAINT "interacoes_pkey" TO "interactions_pkey";

-- AlterTable
ALTER TABLE "media" RENAME CONSTRAINT "midias_pkey" TO "media_pkey";

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "cnpj" TEXT;

-- AlterTable
ALTER TABLE "people" RENAME CONSTRAINT "pessoas_pkey" TO "people_pkey";

-- AlterTable
ALTER TABLE "portal_listings" RENAME CONSTRAINT "publicacoes_portais_pkey" TO "portal_listings_pkey";

-- AlterTable
ALTER TABLE "properties" RENAME CONSTRAINT "imoveis_pkey" TO "properties_pkey";

-- AlterTable
ALTER TABLE "property_status_history" RENAME CONSTRAINT "historico_status_imoveis_pkey" TO "property_status_history_pkey";

-- AlterTable
ALTER TABLE "property_type_options" RENAME CONSTRAINT "tipos_imovel_opcoes_pkey" TO "property_type_options_pkey";

-- DropTable
DROP TABLE "configuracao_contato";

-- DropTable
DROP TABLE "usuarios";

-- DropEnum
DROP TYPE "PapelUsuario";

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "platformOperatorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "organizationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_invite_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_invite_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_audit_logs_platformOperatorId_createdAt_idx" ON "platform_audit_logs"("platformOperatorId", "createdAt");

-- CreateIndex
CREATE INDEX "platform_audit_logs_entity_entityId_idx" ON "platform_audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "platform_audit_logs_organizationId_createdAt_idx" ON "platform_audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "owner_invite_tokens_tokenHash_key" ON "owner_invite_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "owner_invite_tokens_userId_idx" ON "owner_invite_tokens"("userId");

-- RenameForeignKey
ALTER TABLE "deal_people" RENAME CONSTRAINT "negocios_pessoas_negocioId_fkey" TO "deal_people_dealId_fkey";

-- RenameForeignKey
ALTER TABLE "deal_people" RENAME CONSTRAINT "negocios_pessoas_pessoaId_fkey" TO "deal_people_personId_fkey";

-- RenameForeignKey
ALTER TABLE "deals" RENAME CONSTRAINT "negocios_imovelId_fkey" TO "deals_propertyId_fkey";

-- RenameForeignKey
ALTER TABLE "interactions" RENAME CONSTRAINT "interacoes_imovelId_fkey" TO "interactions_propertyId_fkey";

-- RenameForeignKey
ALTER TABLE "interactions" RENAME CONSTRAINT "interacoes_pessoaId_fkey" TO "interactions_personId_fkey";

-- RenameForeignKey
ALTER TABLE "media" RENAME CONSTRAINT "midias_imovelId_fkey" TO "media_propertyId_fkey";

-- RenameForeignKey
ALTER TABLE "portal_listings" RENAME CONSTRAINT "publicacoes_portais_imovelId_fkey" TO "portal_listings_propertyId_fkey";

-- RenameForeignKey
ALTER TABLE "properties" RENAME CONSTRAINT "imoveis_proprietarioId_fkey" TO "properties_ownerId_fkey";

-- RenameForeignKey
ALTER TABLE "property_status_history" RENAME CONSTRAINT "historico_status_imoveis_imovelId_fkey" TO "property_status_history_propertyId_fkey";

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_platformOperatorId_fkey" FOREIGN KEY ("platformOperatorId") REFERENCES "platform_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_invite_tokens" ADD CONSTRAINT "owner_invite_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_invite_tokens" ADD CONSTRAINT "owner_invite_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "negocios_imovelId_idx" RENAME TO "deals_propertyId_idx";

-- RenameIndex
ALTER INDEX "interacoes_pessoaId_idx" RENAME TO "interactions_personId_idx";

-- RenameIndex
ALTER INDEX "midias_imovelId_idx" RENAME TO "media_propertyId_idx";

-- RenameIndex
ALTER INDEX "publicacoes_portais_imovelId_portal_key" RENAME TO "portal_listings_propertyId_portal_key";

-- RenameIndex
ALTER INDEX "historico_status_imoveis_imovelId_idx" RENAME TO "property_status_history_propertyId_idx";

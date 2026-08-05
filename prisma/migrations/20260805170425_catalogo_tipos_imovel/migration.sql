-- CreateEnum
CREATE TYPE "CategoriaTipoImovel" AS ENUM ('RESIDENCIAL', 'COMERCIAL');

-- CreateTable
CREATE TABLE "tipos_imovel_opcoes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" "CategoriaTipoImovel" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipos_imovel_opcoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_imovel_opcoes_categoria_nome_key" ON "tipos_imovel_opcoes"("categoria", "nome");

-- AlterTable: converte a coluna de enum fixo para texto livre (catálogo dinâmico)
ALTER TABLE "imoveis" ALTER COLUMN "tipo" TYPE TEXT USING "tipo"::TEXT;

-- DropEnum
DROP TYPE "TipoImovel";

-- CreateEnum
CREATE TYPE "CategoriaCaracteristica" AS ENUM ('IMOVEL', 'CONDOMINIO');

-- CreateTable
CREATE TABLE "caracteristicas_opcoes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" "CategoriaCaracteristica" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caracteristicas_opcoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caracteristicas_opcoes_categoria_nome_key" ON "caracteristicas_opcoes"("categoria", "nome");

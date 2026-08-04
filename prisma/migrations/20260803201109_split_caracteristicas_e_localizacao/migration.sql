/*
  Warnings:

  - You are about to drop the column `caracteristicas` on the `imoveis` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "imoveis" DROP COLUMN "caracteristicas",
ADD COLUMN     "caracteristicasCondominio" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "caracteristicasImovel" TEXT[] DEFAULT ARRAY[]::TEXT[];

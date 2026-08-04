-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN     "destaque" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "oportunidade" BOOLEAN NOT NULL DEFAULT false;

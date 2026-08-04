-- CreateEnum
CREATE TYPE "EstagioObra" AS ENUM ('NA_PLANTA', 'EM_CONSTRUCAO', 'PRONTO_PARA_MORAR');

-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN     "estagioObra" "EstagioObra",
ADD COLUMN     "previsaoEntrega" TIMESTAMP(3);

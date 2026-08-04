-- CreateSequence
CREATE SEQUENCE "imoveis_codigo_seq";
ALTER SEQUENCE "imoveis_codigo_seq" RESTART WITH 100001;

-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN     "codigo" INTEGER NOT NULL DEFAULT nextval('imoveis_codigo_seq');

-- CreateIndex
CREATE UNIQUE INDEX "imoveis_codigo_key" ON "imoveis"("codigo");

-- AddSequenceOwnership
ALTER SEQUENCE "imoveis_codigo_seq" OWNED BY "imoveis"."codigo";

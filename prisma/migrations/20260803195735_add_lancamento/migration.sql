-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN     "lancamento" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "imoveis_lancamento_idx" ON "imoveis"("lancamento");

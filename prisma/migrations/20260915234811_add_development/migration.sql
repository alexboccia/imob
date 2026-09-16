-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "developmentId" TEXT;

-- CreateTable
CREATE TABLE "developments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "developments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "developments_organizationId_name_key" ON "developments"("organizationId", "name");

-- CreateIndex
CREATE INDEX "properties_organizationId_developmentId_idx" ON "properties"("organizationId", "developmentId");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "developments" ADD CONSTRAINT "developments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

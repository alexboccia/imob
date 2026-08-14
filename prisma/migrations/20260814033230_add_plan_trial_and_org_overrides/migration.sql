-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "priceMonthlyCentsOverride" INTEGER;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trialDays" INTEGER;

-- CreateTable
CREATE TABLE "organization_limit_overrides" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "limit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_limit_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_limit_overrides_organizationId_feature_key" ON "organization_limit_overrides"("organizationId", "feature");

-- AddForeignKey
ALTER TABLE "organization_limit_overrides" ADD CONSTRAINT "organization_limit_overrides_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

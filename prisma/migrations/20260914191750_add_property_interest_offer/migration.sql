-- CreateEnum
CREATE TYPE "OfferSide" AS ENUM ('CLIENT', 'OWNER');

-- CreateTable
CREATE TABLE "property_interest_offers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyInterestId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "side" "OfferSide" NOT NULL,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByMemberId" TEXT,

    CONSTRAINT "property_interest_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_interest_offers_organizationId_propertyInterestId__idx" ON "property_interest_offers"("organizationId", "propertyInterestId", "offeredAt");

-- AddForeignKey
ALTER TABLE "property_interest_offers" ADD CONSTRAINT "property_interest_offers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_interest_offers" ADD CONSTRAINT "property_interest_offers_propertyInterestId_fkey" FOREIGN KEY ("propertyInterestId") REFERENCES "property_interests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_interest_offers" ADD CONSTRAINT "property_interest_offers_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

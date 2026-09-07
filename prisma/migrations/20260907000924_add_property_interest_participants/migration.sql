-- CreateTable
CREATE TABLE "property_interest_participants" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyInterestId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "allocationValue" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_interest_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_interest_participants_organizationId_memberId_idx" ON "property_interest_participants"("organizationId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "property_interest_participants_propertyInterestId_memberId_key" ON "property_interest_participants"("propertyInterestId", "memberId");

-- AddForeignKey
ALTER TABLE "property_interest_participants" ADD CONSTRAINT "property_interest_participants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_interest_participants" ADD CONSTRAINT "property_interest_participants_propertyInterestId_fkey" FOREIGN KEY ("propertyInterestId") REFERENCES "property_interests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_interest_participants" ADD CONSTRAINT "property_interest_participants_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "organization_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "property_interests" ADD COLUMN     "responsibleMemberId" TEXT;

-- CreateIndex
CREATE INDEX "property_interests_organizationId_responsibleMemberId_idx" ON "property_interests"("organizationId", "responsibleMemberId");

-- AddForeignKey
ALTER TABLE "property_interests" ADD CONSTRAINT "property_interests_responsibleMemberId_fkey" FOREIGN KEY ("responsibleMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

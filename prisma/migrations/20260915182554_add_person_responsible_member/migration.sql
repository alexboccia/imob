-- AlterTable
ALTER TABLE "people" ADD COLUMN     "responsibleMemberId" TEXT;

-- CreateIndex
CREATE INDEX "people_organizationId_responsibleMemberId_idx" ON "people"("organizationId", "responsibleMemberId");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_responsibleMemberId_fkey" FOREIGN KEY ("responsibleMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

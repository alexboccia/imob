-- AlterTable
ALTER TABLE "scheduled_activities" ADD COLUMN     "responsibleMemberId" TEXT;

-- CreateIndex
CREATE INDEX "scheduled_activities_organizationId_responsibleMemberId_sch_idx" ON "scheduled_activities"("organizationId", "responsibleMemberId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "scheduled_activities" ADD CONSTRAINT "scheduled_activities_responsibleMemberId_fkey" FOREIGN KEY ("responsibleMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

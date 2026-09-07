-- AlterTable
ALTER TABLE "property_interest_stage_history" ADD COLUMN     "changedByMemberId" TEXT;

-- AddForeignKey
ALTER TABLE "property_interest_stage_history" ADD CONSTRAINT "property_interest_stage_history_changedByMemberId_fkey" FOREIGN KEY ("changedByMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

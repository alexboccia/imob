-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('PRICE', 'FINANCING', 'CLIENT_GAVE_UP', 'PROPERTY_UNAVAILABLE', 'OTHER');

-- AlterTable
ALTER TABLE "property_interests" ADD COLUMN     "lostReason" "LostReason";

-- AlterTable
ALTER TABLE "property_status_history" ADD COLUMN     "changedByMemberId" TEXT;

-- AddForeignKey
ALTER TABLE "property_status_history" ADD CONSTRAINT "property_status_history_changedByMemberId_fkey" FOREIGN KEY ("changedByMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

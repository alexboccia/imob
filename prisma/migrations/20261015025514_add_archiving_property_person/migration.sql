-- AlterTable
ALTER TABLE "people" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedByMemberId" TEXT;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedByMemberId" TEXT;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_archivedByMemberId_fkey" FOREIGN KEY ("archivedByMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_archivedByMemberId_fkey" FOREIGN KEY ("archivedByMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

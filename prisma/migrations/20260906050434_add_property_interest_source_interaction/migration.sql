-- AlterTable
ALTER TABLE "property_interests" ADD COLUMN     "sourceInteractionId" TEXT;

-- AddForeignKey
ALTER TABLE "property_interests" ADD CONSTRAINT "property_interests_sourceInteractionId_fkey" FOREIGN KEY ("sourceInteractionId") REFERENCES "interactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "PropertyInterestStage" ADD VALUE 'WON';

-- AlterTable
ALTER TABLE "property_interests" ADD COLUMN     "closedAt" TIMESTAMP(3);

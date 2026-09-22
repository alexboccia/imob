-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "businessHours" TEXT,
ADD COLUMN     "businessHoursShowHeader" BOOLEAN NOT NULL DEFAULT false;

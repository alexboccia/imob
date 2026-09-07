-- CreateEnum
CREATE TYPE "CommercialVisibility" AS ENUM ('COLLABORATIVE', 'RESTRICTED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "commercialVisibility" "CommercialVisibility" NOT NULL DEFAULT 'COLLABORATIVE';

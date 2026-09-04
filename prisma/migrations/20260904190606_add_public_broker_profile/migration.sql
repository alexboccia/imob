-- AlterTable
ALTER TABLE "organization_members" ADD COLUMN     "publicBio" TEXT,
ADD COLUMN     "publicCreci" TEXT,
ADD COLUMN     "publicPhotoUrl" TEXT,
ADD COLUMN     "publicProfileEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicWhatsapp" TEXT;

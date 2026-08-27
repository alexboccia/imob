-- AlterTable
ALTER TABLE "organization_branding" ADD COLUMN     "footerAppearance" TEXT NOT NULL DEFAULT 'AUTO';

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "footerLogoUrl" TEXT;

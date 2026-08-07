-- AlterTable
ALTER TABLE "organization_members" ADD COLUMN     "whatsapp" TEXT,
ADD COLUMN     "contactEmail" TEXT;

-- Backfill a partir do Usuario legado (mesmo e-mail via "users")
UPDATE "organization_members" om
SET "whatsapp" = u."whatsapp", "contactEmail" = u."emailContato"
FROM "usuarios" u
JOIN "users" nu ON nu.email = u.email
WHERE om."userId" = nu.id;

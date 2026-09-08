-- CreateEnum
CREATE TYPE "LeadCaptureStatus" AS ENUM ('PENDING', 'RESOLVED');

-- CreateTable
CREATE TABLE "lead_captures" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "message" TEXT,
    "origin" TEXT NOT NULL,
    "role" "PersonRole" NOT NULL,
    "propertyId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "referrerHost" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "LeadCaptureStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedByMemberId" TEXT,
    "resolvedPersonId" TEXT,
    "resolvedInteractionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_captures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_captures_resolvedInteractionId_key" ON "lead_captures"("resolvedInteractionId");

-- CreateIndex
CREATE INDEX "lead_captures_organizationId_status_occurredAt_idx" ON "lead_captures"("organizationId", "status", "occurredAt");

-- AddForeignKey
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_resolvedByMemberId_fkey" FOREIGN KEY ("resolvedByMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_resolvedPersonId_fkey" FOREIGN KEY ("resolvedPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_resolvedInteractionId_fkey" FOREIGN KEY ("resolvedInteractionId") REFERENCES "interactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

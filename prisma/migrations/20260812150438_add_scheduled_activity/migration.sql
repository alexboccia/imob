-- CreateEnum
CREATE TYPE "ScheduledActivityType" AS ENUM ('VISIT');

-- CreateEnum
CREATE TYPE "ScheduledActivityStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "scheduled_activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "propertyId" TEXT,
    "propertyInterestId" TEXT,
    "createdByMemberId" TEXT,
    "type" "ScheduledActivityType" NOT NULL DEFAULT 'VISIT',
    "status" "ScheduledActivityStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_activities_organizationId_personId_scheduledAt_idx" ON "scheduled_activities"("organizationId", "personId", "scheduledAt");

-- CreateIndex
CREATE INDEX "scheduled_activities_organizationId_propertyId_scheduledAt_idx" ON "scheduled_activities"("organizationId", "propertyId", "scheduledAt");

-- CreateIndex
CREATE INDEX "scheduled_activities_organizationId_propertyInterestId_sche_idx" ON "scheduled_activities"("organizationId", "propertyInterestId", "scheduledAt");

-- CreateIndex
CREATE INDEX "scheduled_activities_organizationId_status_scheduledAt_idx" ON "scheduled_activities"("organizationId", "status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "scheduled_activities" ADD CONSTRAINT "scheduled_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_activities" ADD CONSTRAINT "scheduled_activities_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_activities" ADD CONSTRAINT "scheduled_activities_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_activities" ADD CONSTRAINT "scheduled_activities_propertyInterestId_fkey" FOREIGN KEY ("propertyInterestId") REFERENCES "property_interests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_activities" ADD CONSTRAINT "scheduled_activities_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

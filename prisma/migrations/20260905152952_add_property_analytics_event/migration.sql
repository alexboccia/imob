-- CreateTable
CREATE TABLE "property_analytics_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "placement" TEXT,
    "visitorHash" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_analytics_events_organizationId_occurredAt_idx" ON "property_analytics_events"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "property_analytics_events_organizationId_propertyId_type_vi_idx" ON "property_analytics_events"("organizationId", "propertyId", "type", "visitorHash", "occurredAt");

-- AddForeignKey
ALTER TABLE "property_analytics_events" ADD CONSTRAINT "property_analytics_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_analytics_events" ADD CONSTRAINT "property_analytics_events_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

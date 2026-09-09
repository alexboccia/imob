-- CreateTable
CREATE TABLE "property_presentation_materials" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_presentation_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_presentation_materials_propertyId_active_sortOrder_idx" ON "property_presentation_materials"("propertyId", "active", "sortOrder");

-- AddForeignKey
ALTER TABLE "property_presentation_materials" ADD CONSTRAINT "property_presentation_materials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_presentation_materials" ADD CONSTRAINT "property_presentation_materials_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

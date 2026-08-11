-- CreateTable
CREATE TABLE "person_preferences" (
    "personId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "transactionType" "PropertyPurpose",
    "propertyTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "neighborhoods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minPrice" DECIMAL(14,2),
    "maxPrice" DECIMAL(14,2),
    "minBedrooms" INTEGER,
    "minBathrooms" INTEGER,
    "minParkingSpots" INTEGER,
    "minArea" DOUBLE PRECISION,
    "maxArea" DOUBLE PRECISION,
    "desiredPropertyFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "desiredCondoFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_preferences_pkey" PRIMARY KEY ("personId")
);

-- CreateIndex
CREATE INDEX "person_preferences_organizationId_idx" ON "person_preferences"("organizationId");

-- AddForeignKey
ALTER TABLE "person_preferences" ADD CONSTRAINT "person_preferences_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_preferences" ADD CONSTRAINT "person_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

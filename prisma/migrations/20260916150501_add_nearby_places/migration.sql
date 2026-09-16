-- CreateEnum
CREATE TYPE "NearbyPlaceCategory" AS ENUM ('MARKET', 'BAKERY', 'PHARMACY', 'HEALTH', 'SCHOOL', 'UNIVERSITY', 'SUBWAY', 'TRANSPORT', 'PARK', 'SHOPPING', 'GYM', 'RESTAURANT', 'PET_SHOP', 'OTHER');

-- CreateEnum
CREATE TYPE "DistanceUnit" AS ENUM ('METERS', 'KILOMETERS');

-- CreateTable
CREATE TABLE "nearby_places" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "category" "NearbyPlaceCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "distance" DOUBLE PRECISION,
    "distanceUnit" "DistanceUnit",
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nearby_places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nearby_places_propertyId_order_idx" ON "nearby_places"("propertyId", "order");

-- AddForeignKey
ALTER TABLE "nearby_places" ADD CONSTRAINT "nearby_places_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nearby_places" ADD CONSTRAINT "nearby_places_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

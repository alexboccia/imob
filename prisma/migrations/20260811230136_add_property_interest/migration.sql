-- CreateEnum
CREATE TYPE "PropertyInterestStage" AS ENUM ('INTERESTED', 'VISIT_SCHEDULED', 'VISITED', 'PROPOSAL', 'REJECTED');

-- CreateTable
CREATE TABLE "property_interests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "stage" "PropertyInterestStage" NOT NULL DEFAULT 'INTERESTED',
    "favorited" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_interests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Só este índice "solto" é necessário: organizationId sozinho e
-- (organizationId, personId) já são servidos, por prefixo esquerdo, pelo
-- UNIQUE INDEX abaixo (organizationId, personId, propertyId). propertyId é
-- a terceira coluna dessa unique, não um prefixo, então esta é a única
-- consulta (ficha do imóvel: organizationId + propertyId) que precisa de
-- índice próprio.
CREATE INDEX "property_interests_organizationId_propertyId_idx" ON "property_interests"("organizationId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "property_interests_organizationId_personId_propertyId_key" ON "property_interests"("organizationId", "personId", "propertyId");

-- AddForeignKey
ALTER TABLE "property_interests" ADD CONSTRAINT "property_interests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_interests" ADD CONSTRAINT "property_interests_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_interests" ADD CONSTRAINT "property_interests_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

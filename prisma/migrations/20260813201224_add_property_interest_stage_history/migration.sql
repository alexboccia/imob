-- CreateTable
CREATE TABLE "property_interest_stage_history" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyInterestId" TEXT NOT NULL,
    "previousStage" "PropertyInterestStage",
    "newStage" "PropertyInterestStage" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_interest_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_interest_stage_history_organizationId_propertyInte_idx" ON "property_interest_stage_history"("organizationId", "propertyInterestId", "changedAt");

-- AddForeignKey
ALTER TABLE "property_interest_stage_history" ADD CONSTRAINT "property_interest_stage_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_interest_stage_history" ADD CONSTRAINT "property_interest_stage_history_propertyInterestId_fkey" FOREIGN KEY ("propertyInterestId") REFERENCES "property_interests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

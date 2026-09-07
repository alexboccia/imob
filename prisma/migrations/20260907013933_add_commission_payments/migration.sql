-- CreateTable
CREATE TABLE "property_interest_participant_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdByMemberId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_interest_participant_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_interest_participant_payments_participantId_paidAt_idx" ON "property_interest_participant_payments"("participantId", "paidAt");

-- CreateIndex
CREATE INDEX "property_interest_participant_payments_organizationId_paidA_idx" ON "property_interest_participant_payments"("organizationId", "paidAt");

-- AddForeignKey
ALTER TABLE "property_interest_participant_payments" ADD CONSTRAINT "property_interest_participant_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_interest_participant_payments" ADD CONSTRAINT "property_interest_participant_payments_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "property_interest_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_interest_participant_payments" ADD CONSTRAINT "property_interest_participant_payments_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_interest_participant_payments" ADD CONSTRAINT "property_interest_participant_payments_cancelledByMemberId_fkey" FOREIGN KEY ("cancelledByMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "supportPhone" TEXT,
    "supportHours" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByOperatorId" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updatedByOperatorId_fkey" FOREIGN KEY ("updatedByOperatorId") REFERENCES "platform_operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

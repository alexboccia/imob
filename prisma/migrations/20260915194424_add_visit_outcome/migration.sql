-- CreateEnum
CREATE TYPE "VisitOutcome" AS ENUM ('INTERESTED', 'UNDECIDED', 'NOT_INTERESTED');

-- AlterEnum
ALTER TYPE "ScheduledActivityStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "scheduled_activities" ADD COLUMN     "outcomeNotes" TEXT,
ADD COLUMN     "visitOutcome" "VisitOutcome";

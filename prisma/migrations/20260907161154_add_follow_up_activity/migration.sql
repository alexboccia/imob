-- AlterEnum
ALTER TYPE "ScheduledActivityType" ADD VALUE 'FOLLOW_UP';

-- AlterTable
ALTER TABLE "scheduled_activities" ADD COLUMN     "subject" TEXT;

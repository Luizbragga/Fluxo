-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "clientRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailCancellation" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailNewBooking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailReschedule" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyProvidersChanges" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyProvidersNewBooking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reminderHoursBefore" INTEGER NOT NULL DEFAULT 24;

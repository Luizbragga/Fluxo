-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "noShowAt" TIMESTAMP(3);

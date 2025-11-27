-- CreateEnum
CREATE TYPE "AppointmentState" AS ENUM ('scheduled', 'in_service', 'done', 'no_show', 'cancelled');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "status" "AppointmentState" NOT NULL DEFAULT 'scheduled';

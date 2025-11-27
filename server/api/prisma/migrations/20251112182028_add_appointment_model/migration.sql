/*
  Warnings:

  - You are about to drop the column `date` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `note` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Appointment` table. All the data in the column will be lost.
  - Added the required column `clientName` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Made the column `serviceId` on table `Appointment` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('scheduled', 'confirmed', 'canceled', 'done');

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_serviceId_fkey";

-- DropIndex
DROP INDEX "Appointment_tenantId_endAt_idx";

-- DropIndex
DROP INDEX "Appointment_tenantId_providerId_date_idx";

-- DropIndex
DROP INDEX "Appointment_tenantId_startAt_idx";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "date",
DROP COLUMN "note",
DROP COLUMN "userId",
ADD COLUMN     "clientName" TEXT NOT NULL,
ADD COLUMN     "clientPhone" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" "AppointmentStatus" NOT NULL DEFAULT 'scheduled',
ALTER COLUMN "serviceId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Appointment_tenantId_idx" ON "Appointment"("tenantId");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_providerId_startAt_idx" ON "Appointment"("tenantId", "providerId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_status_idx" ON "Appointment"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

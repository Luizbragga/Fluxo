/*
  Warnings:

  - You are about to drop the column `notes` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Appointment` table. All the data in the column will be lost.
  - Made the column `clientPhone` on table `Appointment` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_serviceId_fkey";

-- DropIndex
DROP INDEX "Appointment_tenantId_providerId_startAt_idx";

-- DropIndex
DROP INDEX "Appointment_tenantId_status_idx";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "notes",
DROP COLUMN "status",
ADD COLUMN     "createdById" TEXT,
ALTER COLUMN "clientPhone" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Appointment_tenantId_providerId_startAt_endAt_idx" ON "Appointment"("tenantId", "providerId", "startAt", "endAt");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

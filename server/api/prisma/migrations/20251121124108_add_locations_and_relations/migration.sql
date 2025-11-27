/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Tenant` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `locationId` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceDurationMin` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceName` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `servicePriceCents` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `locationId` to the `Provider` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `Tenant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Tenant` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "User_tenantId_email_key";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "locationId" TEXT NOT NULL,
ADD COLUMN     "serviceDurationMin" INTEGER NOT NULL,
ADD COLUMN     "serviceName" TEXT NOT NULL,
ADD COLUMN     "servicePriceCents" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Block" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_tenantId_idx" ON "Location"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_tenantId_slug_key" ON "Location"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "Provider_tenantId_locationId_idx" ON "Provider"("tenantId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

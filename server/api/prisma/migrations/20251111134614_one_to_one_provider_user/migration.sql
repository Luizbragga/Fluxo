/*
  Warnings:

  - You are about to drop the `Barber` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Specialty" AS ENUM ('barber', 'hairdresser', 'nail', 'esthetic', 'makeup', 'tattoo', 'other');

-- DropForeignKey
ALTER TABLE "Barber" DROP CONSTRAINT "Barber_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Barber" DROP CONSTRAINT "Barber_userId_fkey";

-- DropTable
DROP TABLE "Barber";

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" "Specialty" NOT NULL DEFAULT 'other',
    "weekdayTemplate" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Provider_userId_key" ON "Provider"("userId");

-- CreateIndex
CREATE INDEX "Provider_tenantId_idx" ON "Provider"("tenantId");

-- CreateIndex
CREATE INDEX "Provider_tenantId_active_idx" ON "Provider"("tenantId", "active");

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'mbway', 'card', 'transfer', 'other');

-- CreateTable
CREATE TABLE "TenantSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Lisbon',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "use24hClock" BOOLEAN NOT NULL DEFAULT true,
    "defaultAppointmentDurationMin" INTEGER NOT NULL DEFAULT 30,
    "bufferBetweenAppointmentsMin" INTEGER NOT NULL DEFAULT 0,
    "allowOverbooking" BOOLEAN NOT NULL DEFAULT false,
    "minCancelNoticeHours" INTEGER NOT NULL DEFAULT 0,
    "autoNoShowEnabled" BOOLEAN NOT NULL DEFAULT false,
    "noShowAfterMin" INTEGER,
    "defaultPaymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash',

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");

-- CreateIndex
CREATE INDEX "TenantSettings_tenantId_idx" ON "TenantSettings"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

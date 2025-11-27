-- CreateEnum
CREATE TYPE "CustomerPlanStatus" AS ENUM ('active', 'suspended', 'cancelled');

-- CreateEnum
CREATE TYPE "CustomerPlanPaymentStatus" AS ENUM ('pending', 'paid', 'late');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "customerPlanId" TEXT;

-- CreateTable
CREATE TABLE "PlanTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "visitsPerInterval" INTEGER NOT NULL,
    "sameDayServiceIds" JSONB NOT NULL,
    "allowedWeekdays" JSONB NOT NULL,
    "minAdvanceDays" INTEGER NOT NULL DEFAULT 0,
    "isAccumulative" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planTemplateId" TEXT NOT NULL,
    "locationId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "status" "CustomerPlanStatus" NOT NULL DEFAULT 'active',
    "currentCycleStart" TIMESTAMP(3) NOT NULL,
    "currentCycleEnd" TIMESTAMP(3) NOT NULL,
    "visitsUsedInCycle" INTEGER NOT NULL DEFAULT 0,
    "carryOverVisits" INTEGER NOT NULL DEFAULT 0,
    "lastPaymentStatus" "CustomerPlanPaymentStatus" NOT NULL DEFAULT 'pending',
    "lastPaymentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPlanPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerPlanId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "CustomerPlanPaymentStatus" NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPlanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanTemplate_tenantId_idx" ON "PlanTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "PlanTemplate_tenantId_active_idx" ON "PlanTemplate"("tenantId", "active");

-- CreateIndex
CREATE INDEX "CustomerPlan_tenantId_idx" ON "CustomerPlan"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerPlan_tenantId_status_idx" ON "CustomerPlan"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CustomerPlanPayment_tenantId_idx" ON "CustomerPlanPayment"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerPlanPayment_tenantId_status_dueDate_idx" ON "CustomerPlanPayment"("tenantId", "status", "dueDate");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerPlanId_fkey" FOREIGN KEY ("customerPlanId") REFERENCES "CustomerPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTemplate" ADD CONSTRAINT "PlanTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTemplate" ADD CONSTRAINT "PlanTemplate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPlan" ADD CONSTRAINT "CustomerPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPlan" ADD CONSTRAINT "CustomerPlan_planTemplateId_fkey" FOREIGN KEY ("planTemplateId") REFERENCES "PlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPlan" ADD CONSTRAINT "CustomerPlan_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPlanPayment" ADD CONSTRAINT "CustomerPlanPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPlanPayment" ADD CONSTRAINT "CustomerPlanPayment_customerPlanId_fkey" FOREIGN KEY ("customerPlanId") REFERENCES "CustomerPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

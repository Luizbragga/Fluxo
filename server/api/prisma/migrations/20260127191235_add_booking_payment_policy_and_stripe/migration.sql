-- CreateEnum
CREATE TYPE "BookingPaymentPolicy" AS ENUM ('offline_only', 'online_optional', 'online_required');

-- CreateEnum
CREATE TYPE "BookingPaymentKind" AS ENUM ('full', 'deposit');

-- CreateEnum
CREATE TYPE "BookingPaymentStatus" AS ENUM ('requires_action', 'processing', 'succeeded', 'canceled', 'failed', 'refunded');

-- AlterEnum
ALTER TYPE "AppointmentState" ADD VALUE 'pending_payment';

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "bookingDepositPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bookingPaymentPolicy" "BookingPaymentPolicy" NOT NULL DEFAULT 'offline_only';

-- CreateTable
CREATE TABLE "BookingPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "kind" "BookingPaymentKind" NOT NULL,
    "status" "BookingPaymentStatus" NOT NULL DEFAULT 'processing',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "stripePaymentIntentId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingPayment_appointmentId_key" ON "BookingPayment"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPayment_stripePaymentIntentId_key" ON "BookingPayment"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPayment_stripeCheckoutSessionId_key" ON "BookingPayment"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "BookingPayment_tenantId_idx" ON "BookingPayment"("tenantId");

-- CreateIndex
CREATE INDEX "BookingPayment_locationId_idx" ON "BookingPayment"("locationId");

-- CreateIndex
CREATE INDEX "BookingPayment_status_createdAt_idx" ON "BookingPayment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

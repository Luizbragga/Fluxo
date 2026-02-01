/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,id]` on the table `Appointment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "AppointmentPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentPayment_tenantId_idx" ON "AppointmentPayment"("tenantId");

-- CreateIndex
CREATE INDEX "AppointmentPayment_appointmentId_idx" ON "AppointmentPayment"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentPayment_tenantId_appointmentId_idx" ON "AppointmentPayment"("tenantId", "appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentPayment_tenantId_paidAt_idx" ON "AppointmentPayment"("tenantId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_tenantId_id_key" ON "Appointment"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "AppointmentPayment" ADD CONSTRAINT "AppointmentPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentPayment" ADD CONSTRAINT "AppointmentPayment_tenantId_appointmentId_fkey" FOREIGN KEY ("tenantId", "appointmentId") REFERENCES "Appointment"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentPayment" ADD CONSTRAINT "AppointmentPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

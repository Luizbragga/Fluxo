-- CreateTable
CREATE TABLE "AppointmentEarning" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "servicePriceCents" INTEGER NOT NULL,
    "commissionPercentage" INTEGER NOT NULL,
    "providerEarningsCents" INTEGER NOT NULL,
    "houseEarningsCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentEarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentEarning_appointmentId_key" ON "AppointmentEarning"("appointmentId");

-- AddForeignKey
ALTER TABLE "AppointmentEarning" ADD CONSTRAINT "AppointmentEarning_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

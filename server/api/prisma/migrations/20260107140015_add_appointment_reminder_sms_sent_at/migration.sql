-- CreateIndex
CREATE INDEX "Appointment_tenantId_status_startAt_reminderSmsSentAt_idx" ON "Appointment"("tenantId", "status", "startAt", "reminderSmsSentAt");

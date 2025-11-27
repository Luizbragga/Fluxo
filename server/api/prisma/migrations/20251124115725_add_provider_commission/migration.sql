-- CreateTable
CREATE TABLE "ProviderCommission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceId" TEXT,
    "percentage" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderCommission_tenantId_idx" ON "ProviderCommission"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCommission_tenantId_providerId_serviceId_key" ON "ProviderCommission"("tenantId", "providerId", "serviceId");

-- AddForeignKey
ALTER TABLE "ProviderCommission" ADD CONSTRAINT "ProviderCommission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCommission" ADD CONSTRAINT "ProviderCommission_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCommission" ADD CONSTRAINT "ProviderCommission_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

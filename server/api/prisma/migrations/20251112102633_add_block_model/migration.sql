-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'provider';

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Block_tenantId_idx" ON "Block"("tenantId");

-- CreateIndex
CREATE INDEX "Block_providerId_startAt_endAt_idx" ON "Block"("providerId", "startAt", "endAt");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

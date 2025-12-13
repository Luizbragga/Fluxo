-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "managerProviderId" TEXT;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_managerProviderId_fkey" FOREIGN KEY ("managerProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

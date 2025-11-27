-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'paid');

-- AlterTable
ALTER TABLE "AppointmentEarning" ADD COLUMN     "payoutAt" TIMESTAMP(3),
ADD COLUMN     "payoutMethod" TEXT,
ADD COLUMN     "payoutNote" TEXT,
ADD COLUMN     "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'pending';

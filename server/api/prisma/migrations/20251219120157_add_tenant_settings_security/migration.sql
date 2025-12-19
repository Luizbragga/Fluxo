-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "requireReauthForSensitiveActions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sessionIdleTimeoutMin" INTEGER NOT NULL DEFAULT 240,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

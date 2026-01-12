/*
  Warnings:

  - You are about to drop the column `name` on the `Tenant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "name",
ADD COLUMN     "brandName" TEXT,
ADD COLUMN     "legalName" TEXT;

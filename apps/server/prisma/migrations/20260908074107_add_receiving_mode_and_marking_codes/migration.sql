-- CreateEnum
CREATE TYPE "ReceivingMode" AS ENUM ('MANUAL', 'MARKING_SCAN');

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "receiving_mode" "ReceivingMode" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "marking_codes" TEXT[] DEFAULT ARRAY[]::TEXT[];

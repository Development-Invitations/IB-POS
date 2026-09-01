-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RESTAURANT', 'STORE', 'PHARMACY');

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "business_type" "BusinessType" NOT NULL DEFAULT 'RESTAURANT';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "expiry_date" TIMESTAMP(3);

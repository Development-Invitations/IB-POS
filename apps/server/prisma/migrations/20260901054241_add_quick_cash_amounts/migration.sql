-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "quick_cash_amounts" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

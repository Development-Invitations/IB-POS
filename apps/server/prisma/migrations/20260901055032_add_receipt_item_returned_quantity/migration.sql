-- AlterTable
ALTER TABLE "receipt_items" ADD COLUMN     "returned_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0;

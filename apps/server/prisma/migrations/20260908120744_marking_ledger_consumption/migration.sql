/*
  Warnings:

  - Added the required column `store_id` to the `product_markings` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "product_markings_product_id_idx";

-- AlterTable
ALTER TABLE "product_markings" ADD COLUMN     "consumed_at" TIMESTAMP(3),
ADD COLUMN     "receipt_item_id" TEXT,
ADD COLUMN     "store_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "product_markings_store_id_product_id_consumed_at_idx" ON "product_markings"("store_id", "product_id", "consumed_at");

-- CreateIndex
CREATE INDEX "product_markings_receipt_item_id_idx" ON "product_markings"("receipt_item_id");

-- AddForeignKey
ALTER TABLE "product_markings" ADD CONSTRAINT "product_markings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_markings" ADD CONSTRAINT "product_markings_receipt_item_id_fkey" FOREIGN KEY ("receipt_item_id") REFERENCES "receipt_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

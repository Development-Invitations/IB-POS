-- AlterTable
ALTER TABLE "categories" ADD COLUMN "external_id" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN "external_id" TEXT;

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN "exported_to_onec_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "categories_organization_id_external_id_key" ON "categories"("organization_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_external_id_key" ON "products"("organization_id", "external_id");

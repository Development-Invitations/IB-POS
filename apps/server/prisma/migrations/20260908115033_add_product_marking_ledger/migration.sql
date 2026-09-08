-- CreateTable
CREATE TABLE "product_markings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_markings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_markings_product_id_idx" ON "product_markings"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_markings_organization_id_code_key" ON "product_markings"("organization_id", "code");

-- AddForeignKey
ALTER TABLE "product_markings" ADD CONSTRAINT "product_markings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_markings" ADD CONSTRAINT "product_markings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

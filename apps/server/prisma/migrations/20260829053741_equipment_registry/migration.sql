-- CreateEnum
CREATE TYPE "EquipmentKind" AS ENUM ('FISCAL_REGISTRAR', 'CASH_DRAWER', 'CUSTOMER_DISPLAY', 'PAYMENT_TERMINAL', 'BARCODE_SCANNER', 'OTHER');

-- CreateTable
CREATE TABLE "equipment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" "EquipmentKind" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_organization_id_idx" ON "equipment"("organization_id");

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

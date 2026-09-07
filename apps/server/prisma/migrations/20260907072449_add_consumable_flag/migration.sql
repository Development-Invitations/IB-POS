-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "show_consumables_panel" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "is_consumable" BOOLEAN NOT NULL DEFAULT false;

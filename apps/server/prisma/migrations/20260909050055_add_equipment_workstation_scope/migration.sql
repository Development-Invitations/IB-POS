-- AlterTable
ALTER TABLE "equipment" ADD COLUMN     "workstation_id" TEXT;

-- CreateIndex
CREATE INDEX "equipment_workstation_id_idx" ON "equipment"("workstation_id");

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_workstation_id_fkey" FOREIGN KEY ("workstation_id") REFERENCES "workstations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

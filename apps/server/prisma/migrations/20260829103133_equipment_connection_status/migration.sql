-- AlterTable
ALTER TABLE "equipment" ADD COLUMN     "connection_info" TEXT,
ADD COLUMN     "is_connected" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProcessTemplate" ADD COLUMN     "documents" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "documents" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "ProcessFile" ADD COLUMN     "sendToClient" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "slotId" TEXT;

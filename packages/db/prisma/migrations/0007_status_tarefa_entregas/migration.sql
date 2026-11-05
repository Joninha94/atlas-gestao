-- AlterEnum
ALTER TYPE "ProcessStatus" ADD VALUE 'IMPEDIMENTO';

-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "dismissedAt" TIMESTAMP(3),
ADD COLUMN     "dismissedById" TEXT,
ADD COLUMN     "impedimentAt" TIMESTAMP(3),
ADD COLUMN     "impedimentById" TEXT,
ADD COLUMN     "impedimentReason" TEXT;

-- CreateTable
CREATE TABLE "ProcessFile" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mime" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveryId" TEXT,

    CONSTRAINT "ProcessFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "message" TEXT,
    "files" JSONB NOT NULL,
    "recipients" JSONB NOT NULL,
    "pdfKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessFile_processId_idx" ON "ProcessFile"("processId");

-- CreateIndex
CREATE INDEX "DeliveryNote_clientId_createdAt_idx" ON "DeliveryNote"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_tenantId_number_key" ON "DeliveryNote"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "ProcessFile" ADD CONSTRAINT "ProcessFile_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

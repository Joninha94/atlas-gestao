-- AlterTable
ALTER TABLE "ClientCompany" ADD COLUMN     "monthlyFee" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "ProcessTemplate" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "serviceValue" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "serviceValue" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeEntry_tenantId_date_idx" ON "TimeEntry"("tenantId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_processId_idx" ON "TimeEntry"("processId");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

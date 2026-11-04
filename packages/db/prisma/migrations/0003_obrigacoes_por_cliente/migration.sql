-- AlterTable
ALTER TABLE "ProcessTemplate" ADD COLUMN     "dueBusinessDay" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "optIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "postpone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ufs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ClientObligation" (
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientObligation_pkey" PRIMARY KEY ("clientId","templateId")
);

-- CreateIndex
CREATE INDEX "ClientObligation_tenantId_idx" ON "ClientObligation"("tenantId");

-- AddForeignKey
ALTER TABLE "ClientObligation" ADD CONSTRAINT "ClientObligation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientObligation" ADD CONSTRAINT "ClientObligation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProcessTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ExportJob" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveredBy" TEXT,
ADD COLUMN     "deliveryLog" JSONB;

-- CreateTable
CREATE TABLE "AgentDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'DOMINIO',
    "lastSeenAt" TIMESTAMP(3),
    "lastIp" TEXT,
    "version" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AgentDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFailure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "queue" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobId" TEXT,
    "clientId" TEXT,
    "error" TEXT NOT NULL,
    "data" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "JobFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentDevice_tokenHash_key" ON "AgentDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentDevice_tenantId_idx" ON "AgentDevice"("tenantId");

-- CreateIndex
CREATE INDEX "JobFailure_tenantId_resolvedAt_idx" ON "JobFailure"("tenantId", "resolvedAt");

-- CreateIndex
CREATE INDEX "ExportJob_tenantId_deliveredAt_idx" ON "ExportJob"("tenantId", "deliveredAt");

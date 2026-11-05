-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "requireFiles" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProcessEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'USUARIO',
    "actorId" TEXT,
    "actorName" TEXT,
    "text" TEXT NOT NULL,
    "meta" JSONB,

    CONSTRAINT "ProcessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLink" (
    "token" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "contactName" TEXT,
    "externalIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryLink_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "ProcessEvent_processId_at_idx" ON "ProcessEvent"("processId", "at");

-- CreateIndex
CREATE INDEX "DeliveryLink_deliveryId_idx" ON "DeliveryLink"("deliveryId");

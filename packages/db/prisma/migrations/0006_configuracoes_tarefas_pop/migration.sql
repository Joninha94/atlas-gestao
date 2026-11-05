-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "emailFromName" TEXT,
ADD COLUMN     "emailReplyTo" TEXT,
ADD COLUMN     "taskSettings" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessHours" JSONB;

-- AlterTable
ALTER TABLE "ClientCompany" ADD COLUMN     "clientGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "taskGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "flowId" TEXT,
ADD COLUMN     "flowStep" INTEGER,
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "popChecks" JSONB,
ADD COLUMN     "popId" TEXT,
ADD COLUMN     "popItems" JSONB,
ADD COLUMN     "popTitle" TEXT,
ADD COLUMN     "stageId" TEXT;

-- CreateTable
CREATE TABLE "Pop" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "items" JSONB NOT NULL,
    "departmentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSetting" (
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "popId" TEXT,
    "groupId" TEXT,
    "notifyClient" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateSetting_pkey" PRIMARY KEY ("tenantId","templateId")
);

-- CreateTable
CREATE TABLE "TaskGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#1d7871',
    "description" TEXT,

    CONSTRAINT "TaskGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',

    CONSTRAINT "ClientGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardStage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#94a3b8',
    "status" "ProcessStatus" NOT NULL DEFAULT 'EM_PROGRESSO',

    CONSTRAINT "BoardStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskFlow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "event" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pop_tenantId_idx" ON "Pop"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskGroup_tenantId_name_key" ON "TaskGroup"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ClientGroup_tenantId_name_key" ON "ClientGroup"("tenantId", "name");

-- CreateIndex
CREATE INDEX "BoardStage_tenantId_order_idx" ON "BoardStage"("tenantId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_tenantId_event_channel_key" ON "MessageTemplate"("tenantId", "event", "channel");

-- CreateIndex
CREATE INDEX "ClientNotification_clientId_readAt_idx" ON "ClientNotification"("clientId", "readAt");

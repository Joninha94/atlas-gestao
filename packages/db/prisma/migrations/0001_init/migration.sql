-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('ESSENCIAL', 'PROFISSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'GESTOR', 'COLABORADOR');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA', 'PESSOA_FISICA');

-- CreateEnum
CREATE TYPE "CertificateOwner" AS ENUM ('ESCRITORIO', 'CLIENTE');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'WHATSAPP', 'APP');

-- CreateEnum
CREATE TYPE "GuideType" AS ENUM ('DAS_SIMPLES', 'DAS_MEI', 'DCTFWEB_DARF', 'FGTS_MENSAL', 'FGTS_RESCISORIA', 'FGTS_MISTA', 'PARCELAMENTO', 'DARF_AVULSO');

-- CreateEnum
CREATE TYPE "GuideStatus" AS ENUM ('PENDENTE', 'ENVIADA', 'VISUALIZADA', 'PAGA', 'VENCIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "DeclarationType" AS ENUM ('PGDASD', 'DASN_SIMEI', 'DCTFWEB', 'FGTS_DIGITAL', 'DEFIS', 'DIRF');

-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('ENTREGUE', 'AUSENTE', 'EM_ABERTO', 'RETIFICADA');

-- CreateEnum
CREATE TYPE "InstallmentKind" AS ENUM ('PARCSN', 'PERTSN', 'RELPSN', 'PARCMEI', 'PERTMEI', 'RELPMEI', 'PGFN', 'RFB_SIMPLIFICADO_PREVIDENCIARIO', 'RFB_SIMPLIFICADO_NAO_PREVIDENCIARIO', 'ESPECIAL_LEI_11941', 'ESPECIAL_LEI_12996', 'ESPECIAL_PERT', 'OUTRO');

-- CreateEnum
CREATE TYPE "CertidaoKind" AS ENUM ('CND_FEDERAL', 'CNDT_TST', 'CRF_FGTS', 'ESTADUAL', 'MUNICIPAL');

-- CreateEnum
CREATE TYPE "CertidaoStatus" AS ENUM ('NEGATIVA', 'POSITIVA_COM_EFEITO_NEGATIVA', 'POSITIVA', 'INDISPONIVEL', 'ERRO');

-- CreateEnum
CREATE TYPE "MailboxSource" AS ENUM ('ECAC', 'FGTS_DIGITAL', 'DET');

-- CreateEnum
CREATE TYPE "MonitorRoutine" AS ENUM ('SIMPLES', 'MEI', 'DCTFWEB', 'FGTS', 'PARCELAMENTOS', 'SITUACAO_FISCAL', 'CERTIDOES', 'COMPROVANTES', 'CAIXA_POSTAL', 'DECLARACOES');

-- CreateEnum
CREATE TYPE "FiscalDocKind" AS ENUM ('NFE', 'NFCE', 'CTE', 'NFSE');

-- CreateEnum
CREATE TYPE "FiscalDocDirection" AS ENUM ('ENTRADA', 'SAIDA', 'PRESTADO', 'TOMADO');

-- CreateEnum
CREATE TYPE "ManifestationType" AS ENUM ('CIENCIA', 'CONFIRMACAO', 'DESCONHECIMENTO', 'NAO_REALIZADA');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('NA_URA', 'AGUARDANDO', 'EM_ATENDIMENTO', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('WHATSAPP', 'APP_CHAT');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT', 'NOTA_INTERNA');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('NENHUMA', 'DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "DeadlineMode" AS ENUM ('DATA_FIXA', 'TEMPO_ESTIMADO');

-- CreateEnum
CREATE TYPE "ProcessStatus" AS ENUM ('A_FAZER', 'EM_PROGRESSO', 'CONCLUIDO', 'DISPENSADO', 'EM_MULTA');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "AttachmentRule" AS ENUM ('OPCIONAL', 'OBRIGATORIO_PARA_CONCLUIR', 'OBRIGATORIO_CONCLUIR_E_ENVIAR');

-- CreateEnum
CREATE TYPE "FormFieldType" AS ENUM ('TEXTO', 'NUMERO', 'DATA', 'MULTIPLA_ESCOLHA', 'ESCOLHA_UNICA', 'ANEXO', 'CPF', 'CNPJ');

-- CreateEnum
CREATE TYPE "FolderKind" AS ENUM ('ESCRITORIO', 'CLIENTE_RAIZ', 'CLIENTE_LIVRE', 'SISTEMA', 'WHATSAPP');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'ESSENCIAL',
    "logoKey" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassEnc" TEXT,
    "emailFrom" TEXT,
    "emailSignature" TEXT,
    "whatsappPhoneId" TEXT,
    "whatsappTokenEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'COLABORADOR',
    "totpSecretEnc" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "uf" TEXT,
    "city" TEXT,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "ivrOption" INTEGER,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDepartment" (
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isManager" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserDepartment_pkey" PRIMARY KEY ("userId","departmentId")
);

-- CreateTable
CREATE TABLE "ClientCompany" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "regime" "TaxRegime" NOT NULL,
    "legalNature" TEXT,
    "cnae" TEXT,
    "uf" TEXT,
    "city" TEXT,
    "ibgeCity" TEXT,
    "stateRegistration" TEXT,
    "municipalRegistration" TEXT,
    "openedAt" TIMESTAMP(3),
    "partners" JSONB,
    "rawCnpjData" JSONB,
    "notes" TEXT,
    "extraData" JSONB,
    "appAccess" BOOLEAN NOT NULL DEFAULT false,
    "appPlus" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "receives" "Channel"[],
    "appLogin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientResponsible" (
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "ClientResponsible_pkey" PRIMARY KEY ("clientId","departmentId")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "owner" "CertificateOwner" NOT NULL,
    "clientId" TEXT,
    "subjectName" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "pfxEnc" BYTEA NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "dekEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PowerOfAttorney" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "validTo" TIMESTAMP(3),
    "services" TEXT[],
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "ok" BOOLEAN NOT NULL,

    CONSTRAINT "PowerOfAttorney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "ip" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routine" "MonitorRoutine" NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "channels" "Channel"[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autoTransmit" BOOLEAN NOT NULL DEFAULT false,
    "sendOnlyInss" BOOLEAN NOT NULL DEFAULT false,
    "sendReportToClient" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MonitorSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorScheduleOverride" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "routine" "MonitorRoutine" NOT NULL,
    "dayOfMonth" INTEGER,
    "channels" "Channel"[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MonitorScheduleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalGuide" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "GuideType" NOT NULL,
    "competence" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL,
    "fine" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interest" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "barcode" TEXT,
    "pix" TEXT,
    "pdfKey" TEXT,
    "status" "GuideStatus" NOT NULL DEFAULT 'PENDENTE',
    "recalculatedFromId" TEXT,
    "installmentId" TEXT,
    "details" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideDispatch" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "error" TEXT,
    "trackingToken" TEXT NOT NULL,

    CONSTRAINT "GuideDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Declaration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "DeclarationType" NOT NULL,
    "period" TEXT NOT NULL,
    "status" "DeclarationStatus" NOT NULL,
    "receiptKey" TEXT,
    "declKey" TEXT,
    "transmittedAt" TIMESTAMP(3),
    "raw" JSONB,

    CONSTRAINT "Declaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "InstallmentKind" NOT NULL,
    "reference" TEXT,
    "number" TEXT,
    "totalParcels" INTEGER,
    "paidParcels" INTEGER,
    "situation" TEXT,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalSituation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "hasPending" BOOLEAN NOT NULL,
    "reportKey" TEXT NOT NULL,
    "summary" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalSituation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certidao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "CertidaoKind" NOT NULL,
    "uf" TEXT,
    "status" "CertidaoStatus" NOT NULL,
    "validTo" TIMESTAMP(3),
    "fileKey" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certidao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "docNumber" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "revenueCode" TEXT,
    "breakdown" JSONB,
    "fileKey" TEXT,

    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "source" "MailboxSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sender" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readByUserId" TEXT,
    "readAt" TIMESTAMP(3),
    "relevance" TEXT,

    CONSTRAINT "MailboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FgtsEmployee" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "registration" TEXT,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "situation" TEXT NOT NULL,
    "totalPaid" DECIMAL(14,2),
    "avgSalary" DECIMAL(14,2),
    "history" JSONB,

    CONSTRAINT "FgtsEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueSnapshot" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "RevenueSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappNumber" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ivrEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ivrConfig" JSONB,
    "aiRouting" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WhatsappNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "ConversationChannel" NOT NULL,
    "numberId" TEXT,
    "clientId" TEXT,
    "contactPhone" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "status" "ConversationStatus" NOT NULL DEFAULT 'NA_URA',
    "departmentId" TEXT,
    "assigneeId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstReplyAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "aiSummary" TEXT,
    "aiSatisfaction" JSONB,
    "csatScore" INTEGER,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "authorUserId" TEXT,
    "signature" TEXT,
    "body" TEXT,
    "mediaKey" TEXT,
    "mediaType" TEXT,
    "externalId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "recipients" TEXT[],
    "body" TEXT NOT NULL,
    "mediaKey" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalChannel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT,
    "isDirect" BOOLEAN NOT NULL DEFAULT false,
    "memberIds" TEXT[],

    CONSTRAINT "InternalChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT,
    "audioKey" TEXT,
    "fileKey" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "FiscalDocKind" NOT NULL,
    "direction" "FiscalDocDirection" NOT NULL,
    "accessKey" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "series" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "competence" TEXT NOT NULL,
    "issuerDoc" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "receiverDoc" TEXT,
    "receiverName" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "icms" DECIMAL(14,2),
    "iss" DECIMAL(14,2),
    "pis" DECIMAL(14,2),
    "cofins" DECIMAL(14,2),
    "freight" DECIMAL(14,2),
    "retentions" JSONB,
    "status" TEXT NOT NULL,
    "xmlKey" TEXT NOT NULL,
    "pdfKey" TEXT,
    "tags" TEXT[],
    "exportedAt" TIMESTAMP(3),

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocumentItem" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "ncm" TEXT,
    "cfop" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitValue" DECIMAL(14,4) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "generatesCredit" BOOLEAN,

    CONSTRAINT "FiscalDocumentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DfeCursor" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "FiscalDocKind" NOT NULL,
    "lastNsu" TEXT NOT NULL DEFAULT '0',
    "referenceKey" TEXT,
    "nextAllowedAt" TIMESTAMP(3),

    CONSTRAINT "DfeCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manifestation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "type" "ManifestationType" NOT NULL,
    "byUserId" TEXT,
    "byClient" BOOLEAN NOT NULL DEFAULT false,
    "protocol" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Manifestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "docsCount" INTEGER NOT NULL,
    "fileKey" TEXT,
    "error" TEXT,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "regimes" "TaxRegime"[],
    "departmentId" TEXT,
    "deadlineMode" "DeadlineMode" NOT NULL DEFAULT 'DATA_FIXA',
    "dueDay" INTEGER,
    "dueMonthOffset" INTEGER NOT NULL DEFAULT 0,
    "estimatedHours" INTEGER,
    "targetDay" INTEGER,
    "generatesFine" BOOLEAN NOT NULL DEFAULT false,
    "cascade" BOOLEAN NOT NULL DEFAULT false,
    "recurrence" "Recurrence" NOT NULL DEFAULT 'MENSAL',
    "recurrenceMonth" INTEGER,
    "monitorLink" "MonitorRoutine",
    "createdByAi" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProcessTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "dueOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIA',
    "attachment" "AttachmentRule" NOT NULL DEFAULT 'OPCIONAL',
    "documentHint" TEXT,

    CONSTRAINT "TemplateStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ProcessStatus" NOT NULL DEFAULT 'A_FAZER',
    "dismissReason" TEXT,
    "assigneeIds" TEXT[],
    "departmentIds" TEXT[],
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessTask" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "priority" "Priority" NOT NULL,
    "attachment" "AttachmentRule" NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3),
    "blocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProcessTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sentToClientAt" TIMESTAMP(3),
    "matchedByAi" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceForm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "fields" JSONB NOT NULL,
    "createdByAi" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ServiceForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "processId" TEXT,
    "status" "ProcessStatus" NOT NULL DEFAULT 'A_FAZER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "clientId" TEXT,
    "kind" "FolderKind" NOT NULL,
    "name" TEXT NOT NULL,
    "sharedWithClient" BOOLEAN NOT NULL DEFAULT false,
    "clientCanUpload" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfseIssuerConfig" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "cnae" TEXT,
    "issRate" DECIMAL(5,2) NOT NULL,
    "description" TEXT,
    "defaults" JSONB,

    CONSTRAINT "NfseIssuerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfseTaker" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "address" JSONB,

    CONSTRAINT "NfseTaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfseRecurring" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "takerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NfseRecurring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_cnpj_key" ON "Tenant"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_subject_idx" ON "RefreshToken"("subject");

-- CreateIndex
CREATE INDEX "Notification_tenantId_userId_readAt_idx" ON "Notification"("tenantId", "userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_uf_city_key" ON "Holiday"("date", "uf", "city");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_name_key" ON "Department"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ClientCompany_tenantId_regime_idx" ON "ClientCompany"("tenantId", "regime");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCompany_tenantId_document_key" ON "ClientCompany"("tenantId", "document");

-- CreateIndex
CREATE INDEX "Certificate_tenantId_validTo_idx" ON "Certificate"("tenantId", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "PowerOfAttorney_clientId_key" ON "PowerOfAttorney"("clientId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_at_idx" ON "AuditLog"("tenantId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorSchedule_tenantId_routine_key" ON "MonitorSchedule"("tenantId", "routine");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorScheduleOverride_clientId_routine_key" ON "MonitorScheduleOverride"("clientId", "routine");

-- CreateIndex
CREATE INDEX "FiscalGuide_tenantId_status_dueDate_idx" ON "FiscalGuide"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "FiscalGuide_clientId_competence_idx" ON "FiscalGuide"("clientId", "competence");

-- CreateIndex
CREATE UNIQUE INDEX "GuideDispatch_trackingToken_key" ON "GuideDispatch"("trackingToken");

-- CreateIndex
CREATE UNIQUE INDEX "Declaration_clientId_type_period_key" ON "Declaration"("clientId", "type", "period");

-- CreateIndex
CREATE INDEX "FiscalSituation_clientId_fetchedAt_idx" ON "FiscalSituation"("clientId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_clientId_docNumber_key" ON "PaymentReceipt"("clientId", "docNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxMessage_clientId_source_externalId_key" ON "MailboxMessage"("clientId", "source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "FgtsEmployee_clientId_cpf_key" ON "FgtsEmployee"("clientId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueSnapshot_clientId_competence_source_key" ON "RevenueSnapshot"("clientId", "competence", "source");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_status_idx" ON "Conversation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FiscalDocument_clientId_competence_kind_idx" ON "FiscalDocument"("clientId", "competence", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_clientId_accessKey_key" ON "FiscalDocument"("clientId", "accessKey");

-- CreateIndex
CREATE UNIQUE INDEX "DfeCursor_clientId_kind_key" ON "DfeCursor"("clientId", "kind");

-- CreateIndex
CREATE INDEX "Process_tenantId_dueDate_status_idx" ON "Process"("tenantId", "dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Process_templateId_clientId_competence_key" ON "Process"("templateId", "clientId", "competence");

-- CreateIndex
CREATE INDEX "Folder_tenantId_clientId_idx" ON "Folder"("tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "NfseIssuerConfig_clientId_key" ON "NfseIssuerConfig"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "NfseTaker_clientId_document_key" ON "NfseTaker"("clientId", "document");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepartment" ADD CONSTRAINT "UserDepartment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepartment" ADD CONSTRAINT "UserDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCompany" ADD CONSTRAINT "ClientCompany_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientResponsible" ADD CONSTRAINT "ClientResponsible_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientResponsible" ADD CONSTRAINT "ClientResponsible_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerOfAttorney" ADD CONSTRAINT "PowerOfAttorney_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorSchedule" ADD CONSTRAINT "MonitorSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorScheduleOverride" ADD CONSTRAINT "MonitorScheduleOverride_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalGuide" ADD CONSTRAINT "FiscalGuide_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalGuide" ADD CONSTRAINT "FiscalGuide_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideDispatch" ADD CONSTRAINT "GuideDispatch_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "FiscalGuide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Declaration" ADD CONSTRAINT "Declaration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certidao" ADD CONSTRAINT "Certidao_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxMessage" ADD CONSTRAINT "MailboxMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FgtsEmployee" ADD CONSTRAINT "FgtsEmployee_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueSnapshot" ADD CONSTRAINT "RevenueSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "InternalChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocumentItem" ADD CONSTRAINT "FiscalDocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FiscalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DfeCursor" ADD CONSTRAINT "DfeCursor_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manifestation" ADD CONSTRAINT "Manifestation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FiscalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessTemplate" ADD CONSTRAINT "ProcessTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateStep" ADD CONSTRAINT "TemplateStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProcessTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProcessTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessTask" ADD CONSTRAINT "ProcessTask_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProcessTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ServiceForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

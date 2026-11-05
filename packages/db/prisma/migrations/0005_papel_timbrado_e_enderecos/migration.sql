-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "accountantCpf" TEXT,
ADD COLUMN     "accountantCrc" TEXT,
ADD COLUMN     "accountantName" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "uf" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "zipCode" TEXT;

-- AlterTable
ALTER TABLE "ClientCompany" ADD COLUMN     "district" TEXT,
ADD COLUMN     "legalRepName" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "zipCode" TEXT;

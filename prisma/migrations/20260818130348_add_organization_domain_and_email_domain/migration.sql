-- CreateEnum
CREATE TYPE "OrganizationDomainType" AS ENUM ('EASYMOB_SUBDOMAIN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OrganizationDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'ACTIVE', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "OrganizationEmailDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'ACTIVE', 'FAILED');

-- AlterTable
ALTER TABLE "organization_branding" ADD COLUMN     "displayName" TEXT;

-- CreateTable
CREATE TABLE "organization_domains" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "type" "OrganizationDomainType" NOT NULL,
    "status" "OrganizationDomainStatus" NOT NULL DEFAULT 'PENDING',
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_email_domains" (
    "organizationId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "status" "OrganizationEmailDomainStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_email_domains_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_domains_hostname_key" ON "organization_domains"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "organization_domains_verificationToken_key" ON "organization_domains"("verificationToken");

-- CreateIndex
CREATE INDEX "organization_domains_organizationId_idx" ON "organization_domains"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_email_domains_domain_key" ON "organization_email_domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "organization_email_domains_fromAddress_key" ON "organization_email_domains"("fromAddress");

-- AddForeignKey
ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_email_domains" ADD CONSTRAINT "organization_email_domains_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

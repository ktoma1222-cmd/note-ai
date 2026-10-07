-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'REQUESTED', 'CANCELLED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('TABLECHECK_CSV', 'NOTION', 'GMAIL', 'MANUAL');

-- CreateEnum
CREATE TYPE "NotionSyncStatus" AS ENUM ('NOT_SYNCED', 'SYNCED', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "pinHash" TEXT,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "store_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "includeInGroup" BOOLEAN NOT NULL DEFAULT true,
    "notionLabel" TEXT,
    "googleSheetId" TEXT,
    "googleSheetGid" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_pl" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "foodPurchase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suppliesPurchase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inventoryBeginning" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inventoryEnding" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "staffLaborBase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "staffLaborTransport" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "partTimeLaborBase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "partTimeLaborTransport" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advertising" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "utilities" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "welfare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "telecomSecurityTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "monthly_pl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telecom_security_items" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "telecom_security_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telecom_security_details" (
    "id" TEXT NOT NULL,
    "monthlyPLId" TEXT NOT NULL,
    "telecomSecurityItemId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "telecom_security_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isRepeaterOverride" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "notionPageId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "visitDateTime" TIMESTAMP(3),
    "visitYear" INTEGER NOT NULL,
    "visitMonth" INTEGER NOT NULL,
    "partySize" INTEGER,
    "status" "ReservationStatus" NOT NULL,
    "isNewVisit" BOOLEAN NOT NULL,
    "countryRaw" TEXT,
    "country" TEXT,
    "region" TEXT,
    "purpose" TEXT,
    "purposeCategory" TEXT,
    "reservationSource" TEXT NOT NULL DEFAULT 'TableCheck',
    "notes" TEXT,
    "orderNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_usage" (
    "userId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chat_usage_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "login_lock_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_lock_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "externalReservationId" TEXT,
    "storeId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "visitTime" TEXT,
    "partySize" INTEGER,
    "status" "ReservationStatus" NOT NULL DEFAULT 'UNKNOWN',
    "country" TEXT,
    "region" TEXT,
    "reservationSource" TEXT NOT NULL DEFAULT 'TableCheck',
    "purpose" TEXT,
    "isRepeat" BOOLEAN,
    "estimatedAmount" DOUBLE PRECISION,
    "source" "ReservationSource" NOT NULL DEFAULT 'TABLECHECK_CSV',
    "rawSourceData" TEXT,
    "notionPageId" TEXT,
    "notionSyncedAt" TIMESTAMP(3),
    "notionSyncStatus" "NotionSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
    "tablecheckCreatedAt" TIMESTAMP(3),
    "tablecheckUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tablecheck_import_sessions" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rowsJson" TEXT NOT NULL,

    CONSTRAINT "tablecheck_import_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_import_logs" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedBy" TEXT,
    "totalCount" INTEGER NOT NULL,
    "newCount" INTEGER NOT NULL,
    "updatedCount" INTEGER NOT NULL,
    "cancelledCount" INTEGER NOT NULL,
    "unchangedCount" INTEGER NOT NULL,
    "duplicateCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "errorDetail" TEXT,

    CONSTRAINT "reservation_import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tablecheck_store_mappings" (
    "id" TEXT NOT NULL,
    "rawLabel" TEXT NOT NULL,
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tablecheck_store_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "store_access_userId_storeId_key" ON "store_access"("userId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_pl_storeId_year_month_key" ON "monthly_pl"("storeId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "telecom_security_details_monthlyPLId_telecomSecurityItemId_key" ON "telecom_security_details"("monthlyPLId", "telecomSecurityItemId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_dedupKey_key" ON "customers"("dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "visits_notionPageId_key" ON "visits"("notionPageId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_externalReservationId_key" ON "reservations"("externalReservationId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_notionPageId_key" ON "reservations"("notionPageId");

-- CreateIndex
CREATE UNIQUE INDEX "tablecheck_store_mappings_rawLabel_key" ON "tablecheck_store_mappings"("rawLabel");

-- AddForeignKey
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_access" ADD CONSTRAINT "store_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_access" ADD CONSTRAINT "store_access_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_pl" ADD CONSTRAINT "monthly_pl_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telecom_security_items" ADD CONSTRAINT "telecom_security_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telecom_security_details" ADD CONSTRAINT "telecom_security_details_monthlyPLId_fkey" FOREIGN KEY ("monthlyPLId") REFERENCES "monthly_pl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telecom_security_details" ADD CONSTRAINT "telecom_security_details_telecomSecurityItemId_fkey" FOREIGN KEY ("telecomSecurityItemId") REFERENCES "telecom_security_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tablecheck_store_mappings" ADD CONSTRAINT "tablecheck_store_mappings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

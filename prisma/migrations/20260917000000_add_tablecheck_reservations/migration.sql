-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalReservationId" TEXT,
    "storeId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "visitDate" DATETIME NOT NULL,
    "visitTime" TEXT,
    "partySize" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "country" TEXT,
    "region" TEXT,
    "reservationSource" TEXT NOT NULL DEFAULT 'TableCheck',
    "purpose" TEXT,
    "isRepeat" BOOLEAN,
    "source" TEXT NOT NULL DEFAULT 'TABLECHECK_CSV',
    "rawSourceData" TEXT,
    "notionPageId" TEXT,
    "notionSyncedAt" DATETIME,
    "notionSyncStatus" TEXT NOT NULL DEFAULT 'NOT_SYNCED',
    "tablecheckCreatedAt" DATETIME,
    "tablecheckUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "reservations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "reservations_externalReservationId_key" ON "reservations"("externalReservationId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_notionPageId_key" ON "reservations"("notionPageId");

-- CreateTable
CREATE TABLE "reservation_import_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedBy" TEXT,
    "totalCount" INTEGER NOT NULL,
    "newCount" INTEGER NOT NULL,
    "updatedCount" INTEGER NOT NULL,
    "cancelledCount" INTEGER NOT NULL,
    "unchangedCount" INTEGER NOT NULL,
    "duplicateCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "errorDetail" TEXT
);

-- CreateTable
CREATE TABLE "tablecheck_store_mappings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawLabel" TEXT NOT NULL,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tablecheck_store_mappings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "tablecheck_store_mappings_rawLabel_key" ON "tablecheck_store_mappings"("rawLabel");

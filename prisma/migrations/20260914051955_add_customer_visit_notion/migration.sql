-- AlterTable
ALTER TABLE "stores" ADD COLUMN "notionLabel" TEXT;

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isRepeaterOverride" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notionPageId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "visitDateTime" DATETIME,
    "visitYear" INTEGER NOT NULL,
    "visitMonth" INTEGER NOT NULL,
    "partySize" INTEGER,
    "status" TEXT NOT NULL,
    "isNewVisit" BOOLEAN NOT NULL,
    "countryRaw" TEXT,
    "country" TEXT,
    "region" TEXT,
    "purpose" TEXT,
    "purposeCategory" TEXT,
    "reservationSource" TEXT NOT NULL DEFAULT 'TableCheck',
    "notes" TEXT,
    "orderNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "visits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "visits_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastSyncedAt" DATETIME,
    "lastResult" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_dedupKey_key" ON "customers"("dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "visits_notionPageId_key" ON "visits"("notionPageId");

-- AlterTable
ALTER TABLE "stores" ADD COLUMN "googleSheetId" TEXT;

-- CreateTable
CREATE TABLE "google_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "google_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_monthly_pl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenue" REAL NOT NULL DEFAULT 0,
    "foodPurchase" REAL NOT NULL DEFAULT 0,
    "suppliesPurchase" REAL NOT NULL DEFAULT 0,
    "inventoryBeginning" REAL NOT NULL DEFAULT 0,
    "inventoryEnding" REAL NOT NULL DEFAULT 0,
    "staffLaborBase" REAL NOT NULL DEFAULT 0,
    "staffLaborTransport" REAL NOT NULL DEFAULT 0,
    "partTimeLaborBase" REAL NOT NULL DEFAULT 0,
    "partTimeLaborTransport" REAL NOT NULL DEFAULT 0,
    "rent" REAL NOT NULL DEFAULT 0,
    "advertising" REAL NOT NULL DEFAULT 0,
    "utilities" REAL NOT NULL DEFAULT 0,
    "welfare" REAL NOT NULL DEFAULT 0,
    "telecomSecurityTotal" REAL NOT NULL DEFAULT 0,
    "otherExpenses" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "monthly_pl_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_monthly_pl" ("advertising", "createdAt", "foodPurchase", "id", "inventoryBeginning", "inventoryEnding", "month", "partTimeLaborBase", "partTimeLaborTransport", "rent", "revenue", "staffLaborBase", "staffLaborTransport", "storeId", "suppliesPurchase", "telecomSecurityTotal", "updatedAt", "updatedBy", "utilities", "welfare", "year") SELECT "advertising", "createdAt", "foodPurchase", "id", "inventoryBeginning", "inventoryEnding", "month", "partTimeLaborBase", "partTimeLaborTransport", "rent", "revenue", "staffLaborBase", "staffLaborTransport", "storeId", "suppliesPurchase", "telecomSecurityTotal", "updatedAt", "updatedBy", "utilities", "welfare", "year" FROM "monthly_pl";
DROP TABLE "monthly_pl";
ALTER TABLE "new_monthly_pl" RENAME TO "monthly_pl";
CREATE UNIQUE INDEX "monthly_pl_storeId_year_month_key" ON "monthly_pl"("storeId", "year", "month");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

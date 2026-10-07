-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "store_access" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    CONSTRAINT "store_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "store_access_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "includeInGroup" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "monthly_pl" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "monthly_pl_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "telecom_security_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "telecom_security_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "telecom_security_details" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthlyPLId" TEXT NOT NULL,
    "telecomSecurityItemId" TEXT NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "telecom_security_details_monthlyPLId_fkey" FOREIGN KEY ("monthlyPLId") REFERENCES "monthly_pl" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "telecom_security_details_telecomSecurityItemId_fkey" FOREIGN KEY ("telecomSecurityItemId") REFERENCES "telecom_security_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "store_access_userId_storeId_key" ON "store_access"("userId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_pl_storeId_year_month_key" ON "monthly_pl"("storeId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "telecom_security_details_monthlyPLId_telecomSecurityItemId_key" ON "telecom_security_details"("monthlyPLId", "telecomSecurityItemId");

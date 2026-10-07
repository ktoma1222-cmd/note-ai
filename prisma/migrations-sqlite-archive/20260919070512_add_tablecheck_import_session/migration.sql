-- CreateTable
CREATE TABLE "tablecheck_import_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "rowsJson" TEXT NOT NULL
);

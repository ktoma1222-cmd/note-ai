/*
  Warnings:

  - Added the required column `filename` to the `tablecheck_import_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tablecheck_import_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "rowsJson" TEXT NOT NULL
);
INSERT INTO "new_tablecheck_import_sessions" ("createdAt", "expiresAt", "id", "rowsJson") SELECT "createdAt", "expiresAt", "id", "rowsJson" FROM "tablecheck_import_sessions";
DROP TABLE "tablecheck_import_sessions";
ALTER TABLE "new_tablecheck_import_sessions" RENAME TO "tablecheck_import_sessions";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

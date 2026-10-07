-- CreateTable
CREATE TABLE "login_lock_state" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

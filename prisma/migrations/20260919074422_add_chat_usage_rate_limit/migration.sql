-- CreateTable
CREATE TABLE "chat_usage" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "windowStart" DATETIME NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0
);

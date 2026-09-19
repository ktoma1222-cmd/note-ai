-- Switch login from email+password to PIN-only
ALTER TABLE "users" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "users" DROP COLUMN "passwordHash";

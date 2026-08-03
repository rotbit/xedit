-- AlterTable
ALTER TABLE "FeishuConnection" ADD COLUMN     "scopes" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "FeishuDocLink" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'pull';

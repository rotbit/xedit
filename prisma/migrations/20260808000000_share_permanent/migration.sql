-- 分享链接改为永久有效：expiresAt 允许为空（null = 永久），
-- 并把存量分享（含已过期的）一律转为永久，老链接随之复活。
-- AlterTable
ALTER TABLE "DocShare" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- 存量数据转永久
UPDATE "DocShare" SET "expiresAt" = NULL;

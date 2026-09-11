-- 记录最近登录时间；存量用户为空，下次登录时写入
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

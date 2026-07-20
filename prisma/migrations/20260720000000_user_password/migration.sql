-- 邮箱密码注册：为 User 增加 scrypt 密码散列列（OAuth 用户留空）
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

-- 后台管理：为 User 增加注册时间、只读封禁标记与存储配额（字节，NULL=全局默认，0=不限制）
ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN "bannedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "banReason" TEXT;
ALTER TABLE "User" ADD COLUMN "storageQuota" BIGINT;

-- 历史用户的注册时间回填为其最早一篇文档的创建时间（没写过文档的保持迁移时刻）
UPDATE "User" u
SET "createdAt" = d."minCreated"
FROM (
  SELECT "userId", MIN("createdAt") AS "minCreated"
  FROM "Document"
  GROUP BY "userId"
) d
WHERE d."userId" = u."id";

-- 客户端新建去重键：离线新建 / 弱网重试会把同一条「新建」发好几遍，
-- 带同一个 clientKey 的重发只落一篇，后到的直接拿回先落的那篇。
-- 只加可空列 + 唯一索引，存量行一律为 NULL；Postgres 唯一索引默认 NULLS DISTINCT，
-- 多行 NULL 互不冲突，不带 clientKey 的老客户端与服务端建档（MCP、飞书同步）完全不受影响。
ALTER TABLE "Document" ADD COLUMN "clientKey" TEXT;

CREATE UNIQUE INDEX "Document_userId_clientKey_key" ON "Document"("userId", "clientKey");

-- AI 审核历史：每跑成一趟存一条（结果 + 忽略/知道了），方便回看。
-- 纯新增一张表，不动任何存量数据。
CREATE TABLE "ReviewRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "kinds" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "result" JSONB NOT NULL,
    "actions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewRecord_userId_docId_createdAt_idx" ON "ReviewRecord"("userId", "docId", "createdAt" DESC);

ALTER TABLE "ReviewRecord" ADD CONSTRAINT "ReviewRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 「今天」页的当日记录上云：登录用户的事件（写作 / 新建 / 存档 / 完成待办）同步到服务端，多设备一致。
-- id 由客户端生成，(userId, id) 复合主键让重复推送幂等；删除走 deletedAt 墓碑，增量拉取时其它设备才知道要删。
-- 纯新增一张表，不动任何存量数据。
CREATE TABLE "DayLogEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3),
    "kind" TEXT NOT NULL,
    "docId" TEXT,
    "title" TEXT,
    "chars" INTEGER,
    "text" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DayLogEvent_pkey" PRIMARY KEY ("userId","id")
);

CREATE INDEX "DayLogEvent_userId_updatedAt_idx" ON "DayLogEvent"("userId", "updatedAt");

CREATE INDEX "DayLogEvent_userId_day_idx" ON "DayLogEvent"("userId", "day");

ALTER TABLE "DayLogEvent" ADD CONSTRAINT "DayLogEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 每日活跃打点：后台 DAU 曲线的数据源（date 为东八区 YYYY-MM-DD）
CREATE TABLE "DailyActive" (
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,

    CONSTRAINT "DailyActive_pkey" PRIMARY KEY ("userId", "date")
);

CREATE INDEX "DailyActive_date_idx" ON "DailyActive"("date");

ALTER TABLE "DailyActive" ADD CONSTRAINT "DailyActive_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 历史回填：有保存行为的天必然活跃（口径偏保守，只读不写的活跃补不回来）
INSERT INTO "DailyActive" ("userId", "date")
SELECT "userId", "date" FROM "WritingActivity"
ON CONFLICT DO NOTHING;

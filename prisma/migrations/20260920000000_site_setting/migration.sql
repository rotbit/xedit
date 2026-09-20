-- 全站级键值设置（管理后台写）：AI 审核用哪个模型、各家上游 token（密文）。
-- 纯新增一张表，不动任何存量数据。
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

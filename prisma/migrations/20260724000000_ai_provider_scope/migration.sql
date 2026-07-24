-- 「文本对话」与「AI 生图」拆成两份独立配置：主键加上 scope，模型字段合并为 model

-- AlterTable
ALTER TABLE "AiProvider" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'chat',
ADD COLUMN "model" TEXT NOT NULL DEFAULT '';

-- 原有记录即文本配置
UPDATE "AiProvider" SET "model" = "chatModel";

-- 主键改为 (userId, scope, provider)
ALTER TABLE "AiProvider" DROP CONSTRAINT "AiProvider_pkey";
ALTER TABLE "AiProvider" ADD CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("userId","scope","provider");

-- 原来内嵌在平台里的图片模型，拆成独立的 image 记录（沿用同一把 Key，用户后续可各改各的）
INSERT INTO "AiProvider" ("userId","scope","provider","apiKeyEnc","baseUrl","model","updatedAt")
SELECT "userId", 'image', "provider", "apiKeyEnc", "baseUrl", "imageModel", CURRENT_TIMESTAMP
FROM "AiProvider"
WHERE "scope" = 'chat' AND "imageModel" <> '';

-- AlterTable
ALTER TABLE "AiProvider" DROP COLUMN "chatModel",
DROP COLUMN "imageModel";

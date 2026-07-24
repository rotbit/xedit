-- AI 写作/生图功能下线，仅保留文本对话配置（内容审查用）

-- 清掉生图配置记录
DELETE FROM "AiProvider" WHERE "scope" = 'image';

-- AlterTable
ALTER TABLE "UserSettings" DROP COLUMN "aiImageProvider";

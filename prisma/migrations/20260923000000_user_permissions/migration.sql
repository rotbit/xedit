-- 按账号开通功能权限：User 上加一列权限 key 数组，外加 AI 审核 / AI 生成封面的单独每日额度。
-- 纯加列：存量用户权限为空（管理员按 ADMIN_EMAILS 现算、不受影响），额度为空即走全局默认。
ALTER TABLE "User" ADD COLUMN "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "aiReviewDailyLimit" INTEGER;
ALTER TABLE "User" ADD COLUMN "aiCoverDailyLimit" INTEGER;

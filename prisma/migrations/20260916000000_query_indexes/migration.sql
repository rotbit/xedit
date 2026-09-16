-- 飞书同步按 (userId, source) 找已转存的飞书素材；原有索引只到 (userId, createdAt)，
-- 只能顺着 userId 把这人全部素材扫一遍
CREATE INDEX "Asset_userId_source_idx" ON "Asset"("userId", "source");

-- 删顶级批注会先 deleteMany({ where: { parentId } }) 清回复，这条 where 不带 shareId，
-- 现有的 (shareId, createdAt) 索引用不上
CREATE INDEX "ShareComment_parentId_idx" ON "ShareComment"("parentId");

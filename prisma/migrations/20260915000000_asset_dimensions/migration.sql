-- 记录图片像素尺寸；存量与服务端上传路径为空，前端首次展示时回填
ALTER TABLE "Asset" ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER;

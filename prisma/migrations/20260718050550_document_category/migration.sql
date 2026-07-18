-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "category" TEXT NOT NULL DEFAULT '未分类';

-- CreateIndex
CREATE INDEX "Document_userId_category_idx" ON "Document"("userId", "category");

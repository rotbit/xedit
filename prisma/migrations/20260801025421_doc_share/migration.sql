-- CreateTable
CREATE TABLE "DocShare" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowComment" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareComment" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "parentId" TEXT,
    "author" TEXT NOT NULL,
    "authorKeyHash" TEXT NOT NULL DEFAULT '',
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "anchorText" TEXT NOT NULL DEFAULT '',
    "anchorPrefix" TEXT NOT NULL DEFAULT '',
    "anchorIndex" INTEGER NOT NULL DEFAULT 0,
    "body" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocShare_documentId_key" ON "DocShare"("documentId");

-- CreateIndex
CREATE INDEX "ShareComment_shareId_createdAt_idx" ON "ShareComment"("shareId", "createdAt");

-- AddForeignKey
ALTER TABLE "DocShare" ADD CONSTRAINT "DocShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareComment" ADD CONSTRAINT "ShareComment_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "DocShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

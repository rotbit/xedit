-- CreateTable
CREATE TABLE "FeishuConnection" (
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL DEFAULT '',
    "appSecretEnc" TEXT NOT NULL DEFAULT '',
    "feishuOpenId" TEXT NOT NULL DEFAULT '',
    "feishuName" TEXT NOT NULL DEFAULT '',
    "accessTokenEnc" TEXT NOT NULL DEFAULT '',
    "refreshTokenEnc" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spaceId" TEXT NOT NULL DEFAULT '',
    "spaceName" TEXT NOT NULL DEFAULT '',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeishuConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "FeishuDocLink" (
    "userId" TEXT NOT NULL,
    "nodeToken" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "objEditTime" TEXT NOT NULL DEFAULT '',
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeishuDocLink_pkey" PRIMARY KEY ("userId","nodeToken")
);

-- CreateIndex
CREATE INDEX "FeishuDocLink_userId_documentId_idx" ON "FeishuDocLink"("userId", "documentId");

-- AddForeignKey
ALTER TABLE "FeishuConnection" ADD CONSTRAINT "FeishuConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeishuDocLink" ADD CONSTRAINT "FeishuDocLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeishuDocLink" ADD CONSTRAINT "FeishuDocLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "aiChatProvider" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "aiImageProvider" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "AiProvider" (
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL DEFAULT '',
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "chatModel" TEXT NOT NULL DEFAULT '',
    "imageModel" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("userId","provider")
);

-- AddForeignKey
ALTER TABLE "AiProvider" ADD CONSTRAINT "AiProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

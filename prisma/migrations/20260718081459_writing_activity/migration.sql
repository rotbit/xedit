-- CreateTable
CREATE TABLE "WritingActivity" (
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "charsAdded" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WritingActivity_pkey" PRIMARY KEY ("userId","date")
);

-- AddForeignKey
ALTER TABLE "WritingActivity" ADD CONSTRAINT "WritingActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN "confirmToken" TEXT,
ADD COLUMN "confirmTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_confirmToken_key" ON "Settlement"("confirmToken");

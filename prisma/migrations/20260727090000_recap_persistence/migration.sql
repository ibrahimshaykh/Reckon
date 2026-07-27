-- CreateTable
CREATE TABLE "Recap" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "summaryText" TEXT NOT NULL,
    "totalSpentCents" INTEGER NOT NULL,
    "choresCompleted" INTEGER NOT NULL,
    "proposalsDecided" INTEGER NOT NULL,
    "topExpenses" JSONB NOT NULL,
    "choreMvpName" TEXT,
    "bigSpenderName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recap_groupId_month_key" ON "Recap"("groupId", "month");

-- CreateIndex
CREATE INDEX "Recap_groupId_month_idx" ON "Recap"("groupId", "month");

-- AddForeignKey
ALTER TABLE "Recap" ADD CONSTRAINT "Recap_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

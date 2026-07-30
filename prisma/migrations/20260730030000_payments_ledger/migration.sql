-- Records money that actually changed hands.
--
-- Balances were derived purely from expenses and IOUs, so confirming a payment
-- only set a status flag. The next recalculation re-derived the same debt from
-- the same expenses and asked for the money again -- and if a guest paid late,
-- the person who'd already covered them was billed a second time while the
-- money they were owed sat with someone else.
--
-- Payment rows are append-only. Nothing recalculates them, which is the entire
-- point: they are the one part of the ledger that remembers.

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "settlementId" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- One payment per settle cycle. The unique index is what stops a double-click
-- on "confirm received" from recording the money twice and flipping the
-- balance the wrong way.
CREATE UNIQUE INDEX "Payment_settlementId_key" ON "Payment"("settlementId");
CREATE INDEX "Payment_groupId_idx" ON "Payment"("groupId");
CREATE INDEX "Payment_fromUserId_idx" ON "Payment"("fromUserId");
CREATE INDEX "Payment_toUserId_idx" ON "Payment"("toUserId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_fromUserId_fkey"
    FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_toUserId_fkey"
    FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Settlements already confirmed were real payments too, so carry them over.
-- Without this, applying payments to balances would resurrect debts that
-- people have already cleared.
INSERT INTO "Payment" ("id", "groupId", "fromUserId", "toUserId", "amount", "settlementId", "confirmedAt")
SELECT
    'pmt_' || s."id",
    s."groupId",
    s."fromUserId",
    s."toUserId",
    s."amount",
    s."id",
    s."recalculatedAt"
FROM "Settlement" s
WHERE s."status" = 'CONFIRMED';

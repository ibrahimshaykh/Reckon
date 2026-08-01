-- Lets two people trade chores by agreement.
--
-- Rotation is fair on average, but any single round can hand you the one job
-- you particularly hate. The fix isn't to bend the fairness maths — it's to
-- let two people sort it out between themselves.
--
-- Accepting swaps the two assignees and nothing else. Effort is credited when
-- a chore is COMPLETED, so the ledger already follows whoever actually did the
-- work. That also makes it ungameable: someone who keeps swapping heavy jobs
-- away banks less effort, so the next rotation gives them the heavy ones.

CREATE TYPE "SwapStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

CREATE TABLE "ChoreSwapRequest" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fromAssignmentId" TEXT NOT NULL,
    "toAssignmentId" TEXT NOT NULL,
    "status" "SwapStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ChoreSwapRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChoreSwapRequest_groupId_status_idx" ON "ChoreSwapRequest"("groupId", "status");
CREATE INDEX "ChoreSwapRequest_toAssignmentId_status_idx" ON "ChoreSwapRequest"("toAssignmentId", "status");
CREATE INDEX "ChoreSwapRequest_fromAssignmentId_status_idx" ON "ChoreSwapRequest"("fromAssignmentId", "status");

-- One live offer per pair. Without this, spamming the button would leave the
-- other person several identical requests to work through, and accepting the
-- second after the first would try to swap assignments back again.
CREATE UNIQUE INDEX "ChoreSwapRequest_pending_pair_unique"
    ON "ChoreSwapRequest"("fromAssignmentId", "toAssignmentId")
    WHERE "status" = 'PENDING';

ALTER TABLE "ChoreSwapRequest" ADD CONSTRAINT "ChoreSwapRequest_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChoreSwapRequest" ADD CONSTRAINT "ChoreSwapRequest_fromAssignmentId_fkey"
    FOREIGN KEY ("fromAssignmentId") REFERENCES "ChoreAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChoreSwapRequest" ADD CONSTRAINT "ChoreSwapRequest_toAssignmentId_fkey"
    FOREIGN KEY ("toAssignmentId") REFERENCES "ChoreAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

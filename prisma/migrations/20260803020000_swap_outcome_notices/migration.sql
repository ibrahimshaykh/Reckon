-- Telling people how their swap turned out.
--
-- A declined offer simply vanished: the banner disappeared and the person who
-- asked was never told whether the answer was no, or whether anybody had even
-- looked. Silence meant the same thing as a refusal.
--
-- Two pieces. The request now records who asked, because accepting swaps the
-- two assignees — afterwards the assignments no longer say who started it, and
-- the person who needs the answer is exactly the one who asked. And a notice
-- row marks the outcome as seen, so it stays on screen until acknowledged
-- rather than disappearing unread.

ALTER TABLE "ChoreSwapRequest" ADD COLUMN "requesterId" TEXT;

-- Accepting already swapped the assignees, so on those rows the original
-- asker is whoever now holds the OTHER side. Reading fromAssignment for them
-- would name the person who accepted.
UPDATE "ChoreSwapRequest" s
SET "requesterId" = a."userId"
FROM "ChoreAssignment" a
WHERE s."status" = 'ACCEPTED' AND a."id" = s."toAssignmentId";

UPDATE "ChoreSwapRequest" s
SET "requesterId" = a."userId"
FROM "ChoreAssignment" a
WHERE s."requesterId" IS NULL AND a."id" = s."fromAssignmentId";

ALTER TABLE "ChoreSwapRequest" ALTER COLUMN "requesterId" SET NOT NULL;

ALTER TABLE "ChoreSwapRequest" ADD CONSTRAINT "ChoreSwapRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ChoreSwapRequest_requesterId_idx" ON "ChoreSwapRequest"("requesterId");

CREATE TABLE "ChoreSwapNotice" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChoreSwapNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChoreSwapNotice_requestId_userId_key" ON "ChoreSwapNotice"("requestId", "userId");
CREATE INDEX "ChoreSwapNotice_requestId_idx" ON "ChoreSwapNotice"("requestId");

ALTER TABLE "ChoreSwapNotice" ADD CONSTRAINT "ChoreSwapNotice_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "ChoreSwapRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChoreSwapNotice" ADD CONSTRAINT "ChoreSwapNotice_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

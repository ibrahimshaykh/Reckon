-- "Anyone want to swap?" — an open call rather than asking one person at a time.
--
-- A directed offer means guessing who'll say yes; in a flat of four that's
-- three separate asks and three chances to be ignored. An open call is one
-- action, and the first person willing to trade takes it.
--
-- The target is now nullable: null while the call is still looking for a
-- taker, filled in when someone claims it, so the row still records who ended
-- up doing the trade.

ALTER TABLE "ChoreSwapRequest" ALTER COLUMN "toAssignmentId" DROP NOT NULL;

-- One open call per chore. Postgres treats NULLs as distinct in a unique
-- index, so the existing (from, to) index doesn't constrain open calls at all
-- — without this, pressing the button twice would post two identical calls
-- and the second would still be sitting there after the first was taken.
CREATE UNIQUE INDEX "ChoreSwapRequest_open_call_unique"
    ON "ChoreSwapRequest"("fromAssignmentId")
    WHERE "status" = 'PENDING' AND "toAssignmentId" IS NULL;

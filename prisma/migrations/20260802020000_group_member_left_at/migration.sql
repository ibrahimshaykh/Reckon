-- Leaving a group.
--
-- Deleting the membership was never an option: a member's name is on expenses
-- as payer and participant, on settlements, on IOUs, on chores they finished.
-- Removing the row would either break those references or quietly rewrite what
-- everybody else owes — a person walking out shouldn't change anyone's balance.
--
-- So leaving is a state. The history stays exactly as it was; the membership
-- just goes quiet: no new chores, no place in new splits, no access.

ALTER TABLE "GroupMember" ADD COLUMN "leftAt" TIMESTAMP(3);

-- Every existing membership is active; nobody has left yet.
CREATE INDEX "GroupMember_userId_leftAt_idx" ON "GroupMember"("userId", "leftAt");

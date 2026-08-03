-- Retiring a chore instead of deleting it.
--
-- ChoreAssignment cascades from Chore, so deleting a chore that had been done
-- would take its assignments with it. Those assignments are the record of who
-- did the work, so removing a chore would silently erase somebody's credit and
-- make them look like they had been doing nothing.
--
-- A chore that was never assigned has no history to protect and is still
-- deleted outright — nothing is gained by keeping an empty row around.
ALTER TABLE "Chore" ADD COLUMN "archivedAt" TIMESTAMP(3);

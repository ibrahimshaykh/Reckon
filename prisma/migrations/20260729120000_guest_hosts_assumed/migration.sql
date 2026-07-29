-- Says out loud which guests have a host nobody actually picked.
--
-- Guests carried over from GuestToken had no host recorded — the old schema
-- had no such concept — so the migration had to infer one. The expense then
-- displayed "covered by Lola" as though someone had decided that, which is
-- the app asserting a fact it invented.
--
-- Every row that exists at this point came from that backfill, since choosing
-- hosts only became possible in the same release. New guests default to false
-- because a person ticks the boxes.

ALTER TABLE "ExpenseGuest" ADD COLUMN "hostsAssumed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ExpenseGuest" SET "hostsAssumed" = true;

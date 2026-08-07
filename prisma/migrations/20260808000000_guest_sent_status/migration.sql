-- A guest who has actually transferred the money, but whose payer has not yet
-- confirmed it arrived.
--
-- Previously the only thing between "I'll pay" and "paid" was the payer
-- noticing. A guest who had genuinely sent the money had no way to say so, and
-- the payer had no way to tell an intention from a completed transfer.
--
-- Deliberately does NOT move the group's books. Only the payer confirming
-- receipt does that -- see guest-shares.ts. A guest saying they sent it is
-- still only a claim, and rewriting everyone's balances on a claim means
-- rewriting them again when it turns out to be wrong.
ALTER TYPE "GuestStatus" ADD VALUE IF NOT EXISTS 'SENT';

-- What was actually paid, captured when the payer confirms it.
--
-- A share is normally derived from the bill and the head count, which is fine
-- while it is still owed. Once it has been paid it is history, and history
-- should not change because somebody later edited the expense.
ALTER TABLE "ExpenseGuest" ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(10,2);

-- A link the person who OWES can open.
--
-- Settlement already had confirmToken, but that is the other direction: it
-- lets the person owed confirm the money arrived. There was no way to reach
-- the debtor at all except by them opening the app, so a member who does not
-- check it simply never found out what they owed or how to pay it.
--
-- Separate from confirmToken on purpose. They address different people and
-- grant different powers -- one marks money sent, the other marks it received
-- -- and a single token would let whoever held it do both, which is exactly
-- the pair of actions that must stay in different hands.
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "payToken" TEXT;
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "payTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Settlement_payToken_key" ON "Settlement"("payToken");

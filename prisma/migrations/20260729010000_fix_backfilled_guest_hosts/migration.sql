-- Corrects hosts assigned by the backfill in 20260729000000_expense_guests.
--
-- That migration made "whoever paid" the host, which is wrong whenever the
-- payer isn't in the split — buying a round you don't drink is exactly the
-- case the guest feature exists for. The share maths still balanced (an
-- unhostable share falls back to the whole table), but the expense would
-- read "covered by Ibrahim" while actually charging Lola, which is worse
-- than being wrong: it's confidently wrong.
--
-- addGuest rejects a non-participant host, so only backfilled rows can be in
-- this state. A database that never had GuestToken rows sees no change.

-- Give every guest with no valid host the expense's actual participants
-- first, so nobody is briefly left hostless by the delete below.
INSERT INTO "ExpenseGuestHost" ("guestId", "userId")
SELECT DISTINCT g."id", p."userId"
FROM "ExpenseGuest" g
JOIN "ExpenseItem" i ON i."expenseId" = g."expenseId"
JOIN "ExpenseItemParticipant" p ON p."expenseItemId" = i."id"
WHERE NOT EXISTS (
    SELECT 1
    FROM "ExpenseGuestHost" h
    JOIN "ExpenseItem" i2 ON i2."expenseId" = g."expenseId"
    JOIN "ExpenseItemParticipant" p2
        ON p2."expenseItemId" = i2."id" AND p2."userId" = h."userId"
    WHERE h."guestId" = g."id"
)
ON CONFLICT DO NOTHING;

-- Now drop the hosts who were never in the split.
DELETE FROM "ExpenseGuestHost" h
USING "ExpenseGuest" g
WHERE h."guestId" = g."id"
  AND NOT EXISTS (
      SELECT 1
      FROM "ExpenseItem" i
      JOIN "ExpenseItemParticipant" p ON p."expenseItemId" = i."id"
      WHERE i."expenseId" = g."expenseId" AND p."userId" = h."userId"
  );

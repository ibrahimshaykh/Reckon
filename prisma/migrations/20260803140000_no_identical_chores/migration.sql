-- No two chores in a group that nothing can tell apart.
--
-- The live group had two chores called "kill cat", both effort 10, both
-- weekly, created a minute apart — a double-tap on Add. Nothing in the app
-- can separate them: a swap offer naming one is ambiguous, and the rotation
-- deals out twice the work somebody meant to create.
--
-- The app checks before inserting, but a double-tap IS a race, so the check
-- alone can lose it. This is the part that cannot.
--
-- Chores differing in effort or frequency are deliberately still allowed. A
-- daily "kitchen" and a weekly one read as "kitchen (easy, daily)" and
-- "kitchen (hard, weekly)", so they can be told apart; the index matches the
-- same three things the interface shows.

-- Existing copies are retired, keeping the earliest of each set. Archiving
-- rather than deleting: their assignments are the record of work done, and
-- removing the row would cascade that away. Reversible by setting archivedAt
-- back to NULL if one was retired in error.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "groupId", lower(btrim(name)), "effortWeight", frequency
           ORDER BY "createdAt", id
         ) AS copy_number
  FROM "Chore"
  WHERE "archivedAt" IS NULL
)
UPDATE "Chore" c
SET "archivedAt" = now()
FROM ranked r
WHERE c.id = r.id AND r.copy_number > 1;

-- Partial, so retiring a chore and later adding it again still works. A
-- unique index over every row would treat the archived one as a permanent
-- claim on that name.
CREATE UNIQUE INDEX "Chore_no_identical_active"
  ON "Chore" ("groupId", lower(btrim(name)), "effortWeight", frequency)
  WHERE "archivedAt" IS NULL;

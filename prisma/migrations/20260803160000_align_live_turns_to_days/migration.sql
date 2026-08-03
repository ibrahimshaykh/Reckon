-- Snap turns already in flight onto day boundaries.
--
-- Turns created before ends were day-aligned run N×24 hours from whenever
-- Rotate was pressed, so they finish mid-evening and spill into the next date.
-- A daily chore handed out at 00:12 was live on two dates and reported as "due
-- by the end of tomorrow" while you were looking at today — correct for the
-- turn, wrong for anybody reading it.
--
-- New turns are already handled at the point they are created; this brings the
-- ones already running into line so the list reads properly today rather than
-- once they happen to lapse.
--
-- Deliberately narrow:
--   completedAt IS NULL  — recorded work is history and is not rewritten.
--   periodEnd > now      — turns that are over stay exactly as they were.
--
-- Every affected end moves backwards by less than a day, to the midnight the
-- turn should have ended on. Checked before applying: no turn is shortened
-- past the present moment, so nothing that is live becomes overdue.
--
-- The column is `timestamp without time zone` holding UTC, so now() is
-- converted rather than compared directly against a zoned value.
UPDATE "ChoreAssignment" a
SET "periodEnd" = date_trunc('day', a."periodStart") + (
      CASE ch.frequency
        WHEN 'DAILY'    THEN interval '1 day'
        WHEN 'WEEKLY'   THEN interval '7 days'
        WHEN 'BIWEEKLY' THEN interval '14 days'
        ELSE                 interval '30 days'
      END)
FROM "Chore" ch
WHERE ch.id = a."choreId"
  AND a."completedAt" IS NULL
  AND a."periodEnd" > (now() AT TIME ZONE 'UTC')
  AND a."periodEnd" <> date_trunc('day', a."periodStart") + (
        CASE ch.frequency
          WHEN 'DAILY'    THEN interval '1 day'
          WHEN 'WEEKLY'   THEN interval '7 days'
          WHEN 'BIWEEKLY' THEN interval '14 days'
          ELSE                 interval '30 days'
        END);

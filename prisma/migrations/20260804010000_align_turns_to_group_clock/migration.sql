-- Move turns already in flight onto the household's midnight.
--
-- Turns created before groups had a time zone end at midnight UTC, which for a
-- group five hours ahead is five in the morning. So yesterday's chores stayed
-- live through the small hours of today and rolled over at breakfast.
--
-- Recomputed from each turn's own start in its group's clock, using the same
-- rule the app now applies when handing one out. Turns that were already over,
-- and work already recorded as done, are left exactly as they were: both are
-- the record of when something was actually due.
--
-- Some daily turns move into the past by doing this, which is correct — they
-- were yesterday's, and yesterday ended at the household's midnight. They fall
-- to the rotation to re-deal, which is what it is for.
--
-- The column holds UTC without a zone, so each conversion goes out to the
-- group's clock and back rather than being trusted to Postgres's session zone.
UPDATE "ChoreAssignment" a
SET "periodEnd" = (
      (date_trunc('day', (a."periodStart" AT TIME ZONE 'UTC') AT TIME ZONE g."timeZone")
       + (CASE ch.frequency
            WHEN 'DAILY'    THEN interval '1 day'
            WHEN 'WEEKLY'   THEN interval '7 days'
            WHEN 'BIWEEKLY' THEN interval '14 days'
            ELSE                 interval '30 days'
          END)
      ) AT TIME ZONE g."timeZone"
    ) AT TIME ZONE 'UTC'
FROM "Chore" ch
JOIN "Group" g ON g.id = ch."groupId"
WHERE ch.id = a."choreId"
  AND a."completedAt" IS NULL
  AND a."periodEnd" > (now() AT TIME ZONE 'UTC')
  AND g."timeZone" <> 'UTC';

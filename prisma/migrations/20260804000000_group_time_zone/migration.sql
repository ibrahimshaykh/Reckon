-- Whose midnight a chore day ends at.
--
-- Days, turn boundaries and "today" were all computed in UTC. For a household
-- five hours ahead that meant the app still showed yesterday at half past
-- midnight, and daily chores did not roll over until five in the morning.
--
-- UTC is kept as the default so existing groups behave exactly as they do
-- now until somebody opens them and their browser reports where they are.
ALTER TABLE "Group" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC';

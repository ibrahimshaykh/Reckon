-- "Not me" — letting people decline an open call out loud.
--
-- Until now an open call could only be taken. Silence therefore meant two
-- different things, and the person asking couldn't tell them apart: nobody
-- had looked, or everybody had refused. So the call just hung there.
--
-- A row per person turns that into a count, and once everyone who could have
-- taken it has passed, the call closes with an actual answer.

ALTER TYPE "SwapStatus" ADD VALUE 'NO_TAKERS';

CREATE TABLE "ChoreSwapPass" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChoreSwapPass_pkey" PRIMARY KEY ("id")
);

-- One pass per person per call. Pressing twice shouldn't count twice and
-- close the call early on everyone else's behalf.
CREATE UNIQUE INDEX "ChoreSwapPass_requestId_userId_key" ON "ChoreSwapPass"("requestId", "userId");
CREATE INDEX "ChoreSwapPass_requestId_idx" ON "ChoreSwapPass"("requestId");

ALTER TABLE "ChoreSwapPass" ADD CONSTRAINT "ChoreSwapPass_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "ChoreSwapRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChoreSwapPass" ADD CONSTRAINT "ChoreSwapPass_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

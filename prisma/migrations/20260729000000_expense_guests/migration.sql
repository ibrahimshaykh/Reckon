-- Guests become people the split can actually account for.
--
-- GuestToken was only a share link: it recorded a name and a URL, and the
-- guest counted for nothing in the maths. A friend at the table who ate a
-- third of the bill was invisible, so the group quietly absorbed their share
-- with no way to say who was covering it or whether they'd ever pay it back.
--
-- ExpenseGuest replaces it with an answer (GuestStatus) and hosts (the
-- members who brought them and who carry the share until it's paid).

CREATE TYPE "GuestStatus" AS ENUM ('UNDECIDED', 'PAYING', 'PAID', 'DECLINED');

CREATE TABLE "ExpenseGuest" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "status" "GuestStatus" NOT NULL DEFAULT 'UNDECIDED',
    "resolvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseGuest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseGuestHost" (
    "guestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ExpenseGuestHost_pkey" PRIMARY KEY ("guestId","userId")
);

CREATE UNIQUE INDEX "ExpenseGuest_token_key" ON "ExpenseGuest"("token");
CREATE INDEX "ExpenseGuest_expenseId_idx" ON "ExpenseGuest"("expenseId");
CREATE INDEX "ExpenseGuest_token_idx" ON "ExpenseGuest"("token");
CREATE INDEX "ExpenseGuestHost_userId_idx" ON "ExpenseGuestHost"("userId");

ALTER TABLE "ExpenseGuest" ADD CONSTRAINT "ExpenseGuest_expenseId_fkey"
    FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseGuestHost" ADD CONSTRAINT "ExpenseGuestHost_guestId_fkey"
    FOREIGN KEY ("guestId") REFERENCES "ExpenseGuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseGuestHost" ADD CONSTRAINT "ExpenseGuestHost_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry existing links over with their tokens and ids intact, so a link
-- already sitting in someone's chat still opens. UNDECIDED is the honest
-- status for them: the link was sent and never answered.
--
-- These guests now count as heads, which does change the balances on the
-- expenses they belong to. That shift is the point — those people were
-- always at the table, the old schema just couldn't say so.
INSERT INTO "ExpenseGuest" ("id", "token", "expenseId", "name", "email", "status", "expiresAt", "createdAt", "updatedAt")
SELECT "id", "token", "expenseId", "guestName", "guestEmail", 'UNDECIDED', "expiresAt", "createdAt", CURRENT_TIMESTAMP
FROM "GuestToken";

-- Whoever paid is the only person the old schema linked a guest to, so they
-- start as the sole host. Hosts are editable from the expense afterwards.
INSERT INTO "ExpenseGuestHost" ("guestId", "userId")
SELECT g."id", e."paidById"
FROM "GuestToken" g
JOIN "Expense" e ON e."id" = g."expenseId";

DROP TABLE "GuestToken";

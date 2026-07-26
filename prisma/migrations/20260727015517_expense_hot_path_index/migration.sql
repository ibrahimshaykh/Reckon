-- Replace the single-column index with a composite one matching the hot
-- path: listing a group's expenses ordered by createdAt desc.
DROP INDEX "Expense_groupId_idx";
CREATE INDEX "Expense_groupId_createdAt_idx" ON "Expense"("groupId", "createdAt");

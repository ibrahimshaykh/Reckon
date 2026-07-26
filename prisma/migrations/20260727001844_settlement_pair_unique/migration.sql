-- CreateIndex
CREATE UNIQUE INDEX "Settlement_groupId_fromUserId_toUserId_key" ON "Settlement"("groupId", "fromUserId", "toUserId");

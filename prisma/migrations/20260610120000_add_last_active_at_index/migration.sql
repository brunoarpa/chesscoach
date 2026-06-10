-- Effective availability, the search "available now" filter, and the daily
-- activity sweeps all key on lastActiveAt; index it so they don't full-scan.
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");

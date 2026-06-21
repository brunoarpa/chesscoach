-- Coach toggle for accepting new free-trial requests. Existing coaches default
-- to accepting, matching the prior always-on behaviour.
ALTER TABLE "User" ADD COLUMN "acceptingFreeTrials" BOOLEAN NOT NULL DEFAULT true;

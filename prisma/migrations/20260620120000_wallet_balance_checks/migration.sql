-- Database-level backstop for the wallet money invariants the application
-- already enforces in its transactions. A single missed code path could push a
-- balance negative or over-reserve with no safety net; these constraints make
-- the DB reject such a write outright.
--
-- Added NOT VALID on purpose: the constraint is enforced for all new and
-- updated rows immediately, but Postgres does NOT scan existing rows, so the
-- migration can't fail the deploy on any legacy row that already violates it.
-- Existing rows can be validated later with VALIDATE CONSTRAINT once known-good.
--
-- pendingEarnings is intentionally left unconstrained: an admin reversing a
-- no-show payment after the coach withdrew can legitimately drive it negative.

ALTER TABLE "User"
  ADD CONSTRAINT "User_walletBalance_nonneg" CHECK ("walletBalance" >= 0) NOT VALID;

ALTER TABLE "User"
  ADD CONSTRAINT "User_reservedBalance_nonneg" CHECK ("reservedBalance" >= 0) NOT VALID;

ALTER TABLE "User"
  ADD CONSTRAINT "User_reserved_not_over_wallet" CHECK ("reservedBalance" <= "walletBalance") NOT VALID;

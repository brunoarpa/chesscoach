-- Admin override: allow a coach to receive paid bookings without a carried-out free trial
ALTER TABLE "User" ADD COLUMN "paidBookingsApproved" BOOLEAN NOT NULL DEFAULT false;

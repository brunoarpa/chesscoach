import { Badge } from "@/components/ui/badge";

/**
 * Surfaces the *exception* to bookability rather than the default. A coach who
 * can be booked right now shows nothing (keeps lists clean); one who can't shows
 * why: either they've paused new bookings, or they have no upcoming open slots.
 *
 * A coach who is bookable but has opted out of free trials shows a softer
 * "No free trials" note - they can still be booked for paid lessons, so it's an
 * outline (informational) badge rather than a blocking one.
 */
export function BookingStatusBadge({
  bookable,
  hasOpenSlots,
  acceptingFreeTrials = true,
  className,
}: {
  bookable: boolean;
  hasOpenSlots: boolean;
  acceptingFreeTrials?: boolean;
  className?: string;
}) {
  if (!bookable) {
    return (
      <Badge variant="secondary" className={className} title="This coach has paused new bookings">
        Not taking bookings
      </Badge>
    );
  }
  if (!hasOpenSlots) {
    return (
      <Badge variant="secondary" className={className} title="No upcoming open time slots to book">
        No open slots
      </Badge>
    );
  }
  if (!acceptingFreeTrials) {
    return (
      <Badge variant="outline" className={className} title="This coach isn't offering free trials right now - paid lessons only">
        No free trials
      </Badge>
    );
  }
  return null;
}

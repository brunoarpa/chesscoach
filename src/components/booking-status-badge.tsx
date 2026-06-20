import { Badge } from "@/components/ui/badge";

/**
 * Surfaces the *exception* to bookability rather than the default. A coach who
 * can be booked right now shows nothing (keeps lists clean); one who can't shows
 * why: either they've paused new bookings, or they have no upcoming open slots.
 */
export function BookingStatusBadge({
  bookable,
  hasOpenSlots,
  className,
}: {
  bookable: boolean;
  hasOpenSlots: boolean;
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
  return null;
}

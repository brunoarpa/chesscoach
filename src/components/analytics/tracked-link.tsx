"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { track } from "@/lib/analytics";

// A Next.js <Link> that fires a GA4 event on click. Lets a server component
// (e.g. the homepage) keep rendering its markup while the click itself is
// tracked from the client, without turning the whole page into a client tree.
export function TrackedLink({
  event,
  eventParams,
  onClick,
  ...props
}: ComponentProps<typeof Link> & {
  event: string;
  eventParams?: Record<string, unknown>;
}) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        track(event, eventParams ?? {});
        onClick?.(e);
      }}
    />
  );
}

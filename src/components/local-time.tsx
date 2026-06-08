"use client";

interface Props {
  /** ISO 8601 timestamp (UTC instant) to render. */
  iso: string;
  /** Which part to show. Defaults to full date + time. */
  mode?: "datetime" | "date" | "time";
  /** Overrides `mode` when provided. */
  options?: Intl.DateTimeFormatOptions;
}

/**
 * Renders a UTC instant in the *viewer's* local timezone.
 *
 * Date formatting must happen on the client: a server component would format
 * in the server's timezone (UTC on Vercel), so every viewer would see UTC
 * regardless of where they are. Because this is a client component,
 * `toLocaleString` uses the browser's timezone on hydration. The server still
 * emits a (UTC) string for the initial HTML, so `suppressHydrationWarning`
 * silences the expected mismatch; the client value replaces it immediately.
 */
export function LocalTime({ iso, mode = "datetime", options }: Props) {
  const d = new Date(iso);
  let text: string;
  if (options) text = d.toLocaleString(undefined, options);
  else if (mode === "date") text = d.toLocaleDateString();
  else if (mode === "time") text = d.toLocaleTimeString();
  else text = d.toLocaleString();

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}

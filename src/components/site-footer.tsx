"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteFooter() {
  const pathname = usePathname();

  // Hide the footer inside the lesson room (live lessons and the practice
  // board). That view is a focused, full-height app surface; the footer just
  // adds height that causes accidental scrolling, which is especially annoying
  // on phones during a lesson.
  if (pathname?.startsWith("/lesson/")) return null;

  return (
    <footer className="border-t py-6 text-center text-sm text-muted-foreground">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 px-4">
        <span>&copy; {new Date().getFullYear()} EloChaser</span>
        <span className="hidden sm:inline">&middot;</span>
        <Link href="/terms" className="hover:underline">Terms of Service</Link>
        <span className="hidden sm:inline">&middot;</span>
        <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
        <span className="hidden sm:inline">&middot;</span>
        <Link href="/contact" className="hover:underline">Contact</Link>
      </div>
    </footer>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteFooter } from "@/components/site-footer";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "EloChaser - Online Chess Coaching, One-on-One Lessons",
    // Page titles render as "Page name | EloChaser" unless they opt out.
    template: "%s | EloChaser",
  },
  description:
    "Book a personal online chess coach on EloChaser. One-on-one lessons on a live, synced board, matched to your rating and budget. Message coaches free and get your first lessons free.",
  keywords: [
    "chess coach",
    "online chess coach",
    "chess coaching",
    "chess lessons online",
    "chess tutor",
    "learn chess",
    "improve chess rating",
    "chess coach for beginners",
    "one on one chess lessons",
  ],
  applicationName: "EloChaser",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "EloChaser",
    url: SITE_URL,
    title: "EloChaser - Online Chess Coaching, One-on-One Lessons",
    description:
      "Find a personal online chess coach in your rating range and budget. Live synced board, free messaging, first lessons free.",
  },
  twitter: {
    card: "summary_large_image",
    title: "EloChaser - Online Chess Coaching",
    description:
      "Book a personal online chess coach. Live lessons, matched to your rating and budget.",
  },
  robots: { index: true, follow: true },
};

const gaId = process.env.NEXT_PUBLIC_GA_ID;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <Toaster />
        </ThemeProvider>
      </body>
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </html>
  );
}

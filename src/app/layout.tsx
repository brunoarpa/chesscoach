import Link from "next/link";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { LessonFlowGuide } from "@/components/dashboard/lesson-flow-guide";
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
  title: "EloChaser - Find Your Chess Coach",
  description: "Connect with chess coaches and improve your game",
};

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
          <footer className="border-t py-6 text-center text-sm text-muted-foreground">
            <div className="container mx-auto flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 px-4">
              <span>&copy; {new Date().getFullYear()} EloChaser</span>
              <span className="hidden sm:inline">&middot;</span>
              <Link href="/terms" className="hover:underline">Terms of Service</Link>
              <span className="hidden sm:inline">&middot;</span>
              <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
              <span className="hidden sm:inline">&middot;</span>
              <a href="mailto:support@elochaser.com" className="hover:underline">Contact</a>
            </div>
          </footer>
          <LessonFlowGuide />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

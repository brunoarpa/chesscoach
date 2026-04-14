import Link from "next/link";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/navbar";
import { ThemeProvider } from "@/components/theme-provider";
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
  title: "ChessCoach - Find Your Chess Coach",
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
            <div className="container mx-auto flex items-center justify-center gap-4 px-4">
              <span>&copy; {new Date().getFullYear()} ChessCoach</span>
              <span>&middot;</span>
              <Link href="/terms" className="hover:underline">Terms of Service</Link>
              <span>&middot;</span>
              <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
              <span>&middot;</span>
              <a href="mailto:chesscoach.training@gmail.com" className="hover:underline">Contact</a>
            </div>
          </footer>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

import Link from "next/link";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";

export async function Navbar() {
  const session = await auth();

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold">
          ♟ ChessCoach
        </Link>

        <nav className="flex items-center gap-4">
          <Link href="/search" className="text-sm hover:underline">
            Find a Coach
          </Link>
          <Link href="/leaderboard" className="text-sm hover:underline">
            Leaderboard
          </Link>

          {session?.user ? (
            <>
              <Link href="/dashboard" className="text-sm hover:underline">
                Dashboard
              </Link>
              <Link href="/wallet" className="text-sm hover:underline">
                Wallet
              </Link>
              <Link
                href={`/profile/${(session.user as unknown as Record<string, unknown>).username}`}
                className="text-sm hover:underline"
              >
                Profile
              </Link>
              {(session.user as unknown as Record<string, unknown>).role === "ADMIN" && (
                <Link href="/admin" className="text-sm hover:underline text-red-500">
                  Admin
                </Link>
              )}
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">Sign up</Button>
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

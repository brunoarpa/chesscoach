import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AvailabilityToggle } from "@/components/availability-toggle";
import { MobileNav } from "@/components/mobile-nav";
import { NavLink } from "@/components/nav-link";

export async function Navbar() {
  const session = await auth();

  let coachAvailability: string | null = null;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { coachAvailability: true },
    });
    coachAvailability = user?.coachAvailability ?? null;
  }

  const username = session?.user?.username ?? null;
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold">
          ♝ ChessCoach
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          <NavLink
            href="/search"
            className="text-sm px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
            activeClassName="bg-muted font-medium"
          >
            Find a Coach
          </NavLink>
          <NavLink
            href="/how-it-works"
            className="text-sm px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
            activeClassName="bg-muted font-medium"
          >
            How It Works
          </NavLink>
          <NavLink
            href="/leaderboard"
            className="text-sm px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
            activeClassName="bg-muted font-medium"
          >
            Leaderboard
          </NavLink>

          {session?.user ? (
            <>
              <NavLink
                href="/dashboard"
                className="text-sm px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
                activeClassName="bg-muted font-medium"
              >
                Dashboard
              </NavLink>
              <NavLink
                href="/wallet"
                className="text-sm px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
                activeClassName="bg-muted font-medium"
              >
                Wallet
              </NavLink>
              {username && (
                <NavLink
                  href={`/profile/${username}`}
                  className="text-sm px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
                  activeClassName="bg-muted font-medium"
                >
                  Profile
                </NavLink>
              )}
              {isAdmin && (
                <NavLink
                  href="/admin"
                  className="text-sm px-3 py-1.5 rounded-full hover:bg-muted transition-colors text-red-500"
                  activeClassName="bg-muted font-medium"
                >
                  Admin
                </NavLink>
              )}
              <SignOutButton />
            </>
          ) : (
            <Link href="/login">
              <Button size="sm">Sign in</Button>
            </Link>
          )}
          {coachAvailability && <AvailabilityToggle initialStatus={coachAvailability} />}
          <ThemeToggle />
        </nav>

        {/* Mobile nav */}
        <div className="flex md:hidden items-center gap-2">
          {coachAvailability && <AvailabilityToggle initialStatus={coachAvailability} />}
          <ThemeToggle />
          <MobileNav
            isLoggedIn={!!session?.user}
            username={username ?? undefined}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </header>
  );
}

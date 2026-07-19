import Link from "next/link";
import { Search, ScanSearch, BookOpen, Puzzle } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/mobile-nav";
import { NavLink } from "@/components/nav-link";
import { AccountMenu } from "@/components/account-menu";
import { NotificationBell, type NotificationItem } from "@/components/notification-bell";
import { getNotifications } from "@/lib/actions/notifications";
import { getUnreadMessageCount } from "@/lib/actions/messages";

export async function Navbar() {
  const session = await auth();

  let notifications: NotificationItem[] = [];
  let unreadCount = 0;
  let unreadMessages = 0;
  let walletAvailable = 0;
  if (session?.user?.id) {
    const [user, notifData, msgCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { lastActiveAt: true, walletBalance: true, reservedBalance: true },
      }),
      getNotifications(),
      getUnreadMessageCount(),
    ]);
    notifications = notifData.notifications;
    unreadCount = notifData.unreadCount;
    unreadMessages = msgCount;

    if (user) {
      walletAvailable = user.walletBalance - user.reservedBalance;

      // Touch lastActiveAt on any page view, throttled to one write per 5 min.
      // This keeps effective availability and activity dots honest for users who
      // browse without opening the dashboard.
      // eslint-disable-next-line react-hooks/purity -- Server Component: rendered once per request, so Date.now() is stable here.
      if (Date.now() - user.lastActiveAt.getTime() > 5 * 60 * 1000) {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
        });
      }
    }
  }

  const username = session?.user?.username ?? null;
  const image = session?.user?.image ?? null;
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Left group: logo + browse links */}
        <div className="flex items-center gap-2">
          <Link href="/" className="text-xl font-bold">
            ♝ EloChaser
          </Link>
          <nav className="hidden md:flex items-center gap-1 ml-2">
            <NavLink
              href="/search"
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
              activeClassName="bg-muted font-medium"
            >
              <Search className="h-4 w-4" />
              Find a Coach
            </NavLink>
            <NavLink
              href="/review"
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
              activeClassName="bg-muted font-medium"
            >
              <ScanSearch className="h-4 w-4" />
              Review a game
            </NavLink>
            <NavLink
              href="/puzzles"
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
              activeClassName="bg-muted font-medium"
            >
              <Puzzle className="h-4 w-4" />
              Puzzles
            </NavLink>
            <NavLink
              href="/blog"
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
              activeClassName="bg-muted font-medium"
            >
              <BookOpen className="h-4 w-4" />
              Blog
            </NavLink>
          </nav>
        </div>

        {/* Right group: account zone */}
        <div className="flex items-center gap-2">
          {/* Desktop account zone */}
          {session?.user ? (
            <div className="hidden md:flex items-center gap-2">
              {session.user.id && (
                <NotificationBell
                  userId={session.user.id}
                  initialNotifications={notifications}
                  initialUnreadCount={unreadCount}
                />
              )}
              <AccountMenu
                userId={session.user.id}
                username={username}
                image={image}
                isAdmin={isAdmin}
                initialUnreadMessages={unreadMessages}
              />
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <NavLink
                href="/contact"
                className="text-sm px-3 py-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                activeClassName="bg-muted font-medium text-foreground"
              >
                Contact
              </NavLink>
              <Link href="/login">
                <Button size="sm">Sign in</Button>
              </Link>
            </div>
          )}

          {/* Mobile nav */}
          <div className="flex md:hidden items-center gap-2">
            {session?.user?.id && (
              <NotificationBell
                userId={session.user.id}
                initialNotifications={notifications}
                initialUnreadCount={unreadCount}
              />
            )}
            <MobileNav
              isLoggedIn={!!session?.user}
              username={username ?? undefined}
              isAdmin={isAdmin}
              walletAvailable={walletAvailable}
              unreadMessages={unreadMessages}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

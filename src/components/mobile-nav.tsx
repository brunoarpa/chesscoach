"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { signOut } from "next-auth/react";

interface MobileNavProps {
  isLoggedIn: boolean;
  username?: string;
  isAdmin?: boolean;
  walletAvailable?: number;
}

export function MobileNav({ isLoggedIn, username, isAdmin, walletAvailable = 0 }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="md:hidden p-2">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 pt-10">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <nav className="flex flex-col gap-1">
          {/* Browse zone */}
          <MobileLink href="/search" onClose={() => setOpen(false)}>
            Find a Coach
          </MobileLink>
          <MobileLink href="/review" onClose={() => setOpen(false)}>
            Review a game
          </MobileLink>
          <MobileLink href="/leaderboard" onClose={() => setOpen(false)}>
            Leaderboard
          </MobileLink>

          {isLoggedIn ? (
            <>
              {/* Account zone */}
              <div className="border-t my-2" />
              <MobileLink href="/dashboard" onClose={() => setOpen(false)}>
                Dashboard
              </MobileLink>
              <MobileLink href="/wallet" onClose={() => setOpen(false)}>
                <span className="flex items-center justify-between gap-2">
                  Wallet
                  <span className="text-muted-foreground">${(walletAvailable / 100).toFixed(2)}</span>
                </span>
              </MobileLink>
              {username && (
                <MobileLink href={`/profile/${username}`} onClose={() => setOpen(false)}>
                  Profile
                </MobileLink>
              )}
              <MobileLink href="/contact" onClose={() => setOpen(false)}>
                Contact
              </MobileLink>
              {isAdmin && (
                <MobileLink href="/admin" onClose={() => setOpen(false)} className="text-red-500">
                  Admin
                </MobileLink>
              )}
              <div className="border-t my-2" />
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-sm px-3 py-2 rounded-md text-left hover:bg-muted transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <MobileLink href="/contact" onClose={() => setOpen(false)}>
                Contact
              </MobileLink>
              <div className="border-t my-2" />
              <MobileLink href="/login" onClose={() => setOpen(false)}>
                Sign in
              </MobileLink>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileLink({
  href,
  onClose,
  children,
  className,
}: {
  href: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      onClick={onClose}
      aria-current={isActive ? "page" : undefined}
      className={`text-sm px-3 py-2 rounded-md hover:bg-muted transition-colors ${
        isActive ? "bg-muted font-medium" : ""
      } ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}

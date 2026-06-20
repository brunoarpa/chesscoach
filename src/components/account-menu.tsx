"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  User,
  Wallet,
  Mail,
  Shield,
  LogOut,
  ChevronDown,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AccountMenuProps {
  username?: string | null;
  image?: string | null;
  isAdmin?: boolean;
}

function initials(username?: string | null) {
  if (!username) return "?";
  return username.slice(0, 2).toUpperCase();
}

export function AccountMenu({ username, image, isAdmin }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 rounded-full p-0.5 pr-1 hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar size="sm">
          {image && <AvatarImage src={image} alt="" />}
          <AvatarFallback>{initials(username)}</AvatarFallback>
        </Avatar>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {username && (
          <>
            <DropdownMenuLabel className="truncate">{username}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard />
            Dashboard
          </Link>
        </DropdownMenuItem>
        {username && (
          <DropdownMenuItem asChild>
            <Link href={`/profile/${username}`}>
              <User />
              Profile
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/wallet">
            <Wallet />
            Wallet
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/contact">
            <Mail />
            Contact
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild variant="destructive">
            <Link href="/admin">
              <Shield />
              Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/" })}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

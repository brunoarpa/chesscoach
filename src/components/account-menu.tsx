"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  User,
  Wallet,
  MessageCircle,
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
import { getPusherClient } from "@/lib/pusher-client";
import { userChannel, MESSAGE_NEW_EVENT } from "@/lib/notification-channel";

interface AccountMenuProps {
  userId?: string | null;
  username?: string | null;
  image?: string | null;
  isAdmin?: boolean;
  initialUnreadMessages?: number;
}

function initials(username?: string | null) {
  if (!username) return "?";
  return username.slice(0, 2).toUpperCase();
}

export function AccountMenu({
  userId,
  username,
  image,
  isAdmin,
  initialUnreadMessages = 0,
}: AccountMenuProps) {
  const [unreadMessages, setUnreadMessages] = useState(initialUnreadMessages);

  // Keep the badge in sync with the server count on navigation.
  useEffect(() => {
    setUnreadMessages(initialUnreadMessages);
  }, [initialUnreadMessages]);

  // Live bump when a new message arrives while the app is open.
  useEffect(() => {
    if (!userId) return;
    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(userChannel(userId));
    const handler = () => setUnreadMessages((n) => n + 1);
    channel.bind(MESSAGE_NEW_EVENT, handler);
    return () => {
      channel.unbind(MESSAGE_NEW_EVENT, handler);
    };
  }, [userId]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative flex items-center gap-1 rounded-full p-0.5 pr-1 hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar size="sm">
          {image && <AvatarImage src={image} alt="" />}
          <AvatarFallback>{initials(username)}</AvatarFallback>
        </Avatar>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        {unreadMessages > 0 && (
          <span
            className="absolute -top-0.5 left-4 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background"
            aria-hidden
          />
        )}
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
        <DropdownMenuItem asChild>
          <Link href="/messages" onClick={() => setUnreadMessages(0)}>
            <MessageCircle />
            <span className="flex-1">Messages</span>
            {unreadMessages > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {unreadMessages > 9 ? "9+" : unreadMessages}
              </span>
            )}
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

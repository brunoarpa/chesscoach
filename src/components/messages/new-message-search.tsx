"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { searchUsersToMessage, type UserSearchResultDTO } from "@/lib/actions/messages";

function initials(username?: string | null) {
  if (!username) return "?";
  return username.slice(0, 2).toUpperCase();
}

/**
 * Type a name to find any user and open (or start) a thread with them, so you
 * can message someone even without a prior conversation or shared lesson.
 */
export function NewMessageSearch({
  onPick,
}: {
  onPick: (user: UserSearchResultDTO) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResultDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Guards against out-of-order responses overwriting newer results.
  const reqIdRef = useRef(0);

  // Debounced fetch. Loading/clearing for short queries is handled in onChange
  // so the effect body never calls setState synchronously.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = ++reqIdRef.current;
    const t = setTimeout(async () => {
      const res = await searchUsersToMessage(q);
      if (id !== reqIdRef.current) return;
      setResults(res);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function pick(user: UserSearchResultDTO) {
    onPick(user);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            setOpen(true);
            if (value.trim().length < 2) {
              setResults([]);
              setLoading(false);
            } else {
              setLoading(true);
            }
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search a name to message..."
          className="w-full rounded-md border bg-background py-1.5 pl-8 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {loading ? (
            <p className="px-3 py-3 text-center text-xs text-muted-foreground">Searching...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-muted-foreground">
              No users found.
            </p>
          ) : (
            <ul className="divide-y">
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => pick(u)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60"
                  >
                    <Avatar size="sm">
                      {u.image && <AvatarImage src={u.image} alt="" />}
                      <AvatarFallback>{initials(u.username)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-medium">
                      {u.username ?? "Unknown"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

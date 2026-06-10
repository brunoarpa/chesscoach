"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateCoachAvailability } from "@/lib/actions/auth";
import { toast } from "sonner";

const statuses = [
  { value: "AVAILABLE" as const, label: "Available", badgeClass: "bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400" },
  { value: "UNAVAILABLE" as const, label: "Unavailable", badgeVariant: "secondary" as const },
];

export function AvailabilityToggle({ initialStatus }: { initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const current = statuses.find((s) => s.value === status) ?? statuses[1];

  async function handleChange(newStatus: "AVAILABLE" | "UNAVAILABLE") {
    const prevStatus = status;
    setStatus(newStatus);
    const result = await updateCoachAvailability(newStatus);
    if (result?.error) {
      setStatus(prevStatus);
      toast.error(result.error);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="cursor-pointer" title={`Status: ${current.label}`}>
          {"badgeClass" in current ? (
            <Badge className={current.badgeClass}>{current.label}</Badge>
          ) : (
            <Badge variant={current.badgeVariant}>{current.label}</Badge>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {statuses.map((s) => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => handleChange(s.value)}
            className={status === s.value ? "font-semibold" : ""}
          >
            {"badgeClass" in s ? (
              <Badge className={s.badgeClass}>{s.label}</Badge>
            ) : (
              <Badge variant={s.badgeVariant}>{s.label}</Badge>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground max-w-[15rem]">
          If you&apos;re away from the site for 24h+, students temporarily see
          you as Unavailable — visiting any page brings you back. Setting
          Unavailable here keeps you hidden until you switch back yourself.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateCoachAvailability } from "@/lib/actions/auth";

const statuses = [
  { value: "AVAILABLE" as const, color: "bg-green-500", label: "Available" },
  { value: "BUSY" as const, color: "bg-red-500", label: "Busy" },
  { value: "UNAVAILABLE" as const, color: "bg-gray-400", label: "Unavailable" },
];

export function AvailabilityToggle({ initialStatus }: { initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const current = statuses.find((s) => s.value === status) ?? statuses[2];

  async function handleChange(newStatus: "AVAILABLE" | "BUSY" | "UNAVAILABLE") {
    setStatus(newStatus);
    await updateCoachAvailability(newStatus);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title={`Status: ${current.label}`}>
          <span className={`w-3 h-3 rounded-full ${current.color}`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {statuses.map((s) => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => handleChange(s.value)}
            className={status === s.value ? "font-semibold" : ""}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${s.color} mr-2`} />
            {s.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

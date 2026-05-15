"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface Props {
  name: string;
  options: MultiSelectOption[];
  defaultValue?: string[];
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  name,
  options,
  defaultValue = [],
  placeholder = "Select…",
  className,
}: Props) {
  const [selected, setSelected] = useState<string[]>(defaultValue);

  function toggle(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function remove(value: string) {
    setSelected((prev) => prev.filter((v) => v !== value));
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full min-h-9 items-center justify-between rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              className,
            )}
          >
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1">
                {selected.map((v) => {
                  const opt = options.find((o) => o.value === v);
                  return (
                    <Badge
                      key={v}
                      variant="secondary"
                      className="gap-1 font-normal"
                    >
                      {opt?.label ?? v}
                      <span
                        role="button"
                        tabIndex={-1}
                        aria-label={`Remove ${opt?.label ?? v}`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          remove(v);
                        }}
                        className="cursor-pointer rounded-sm hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </Badge>
                  );
                })}
              </div>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-72 w-(--radix-dropdown-menu-trigger-width) overflow-y-auto"
        >
          {options.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt.value}
              checked={selected.includes(opt.value)}
              onCheckedChange={() => toggle(opt.value)}
              onSelect={(e) => e.preventDefault()}
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {selected.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
    </>
  );
}

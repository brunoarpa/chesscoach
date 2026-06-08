"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LocalTime } from "@/components/local-time";

interface Lesson {
  id: string;
  status: string;
  communicationMethod: string | null;
  estimatedCost: number;
  scheduledStartAt: string | null;
  createdAt: string;
  dataPurgedAt: string | null;
  student: { username: string | null };
  coach: { username: string | null };
}

export function LessonList({ lessons }: { lessons: Lesson[] }) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? lessons.filter(
        (l) =>
          l.id.toLowerCase().includes(q) ||
          (l.student.username ?? "").toLowerCase().includes(q) ||
          (l.coach.username ?? "").toLowerCase().includes(q),
      )
    : lessons;

  return (
    <div className="space-y-4">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by student, coach, or lesson ID…"
        className="max-w-sm"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lesson</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Coach</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Scheduled</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                No lessons found.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((lesson) => (
              <TableRow key={lesson.id}>
                <TableCell className="font-mono text-xs">{lesson.id.slice(0, 8)}…</TableCell>
                <TableCell>{lesson.student.username ?? "—"}</TableCell>
                <TableCell>{lesson.coach.username ?? "—"}</TableCell>
                <TableCell>
                  {lesson.communicationMethod ? (
                    <Badge variant="outline">{lesson.communicationMethod}</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={lesson.status === "DISPUTED" ? "destructive" : "secondary"}>
                    {lesson.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {lesson.scheduledStartAt ? (
                    <LocalTime iso={lesson.scheduledStartAt} />
                  ) : (
                    <LocalTime iso={lesson.createdAt} mode="date" />
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">
                  ${(lesson.estimatedCost / 100).toFixed(2)}
                </TableCell>
                <TableCell>
                  {lesson.dataPurgedAt && (
                    <Badge variant="outline" className="text-amber-600">Purged</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <a
                    href={`/admin/lesson/${lesson.id}/chat`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline"
                  >
                    View chat
                  </a>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

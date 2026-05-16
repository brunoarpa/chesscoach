import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  ACCEPTED: "default",
  IN_PROGRESS: "default",
  DECLINED: "destructive",
  EXPIRED: "outline",
  COMPLETED: "default",
  CANCELLED: "outline",
  DISPUTED: "destructive",
  NO_SHOW: "destructive",
};

interface PageProps {
  searchParams: Promise<{ role?: string }>;
}

export default async function DashboardHistoryPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const role = params.role === "coach" ? "coach" : "student";

  const where = role === "coach"
    ? { coachId: session.user.id }
    : { studentId: session.user.id };

  const requests = await prisma.lessonRequest.findMany({
    where,
    include: {
      student: { select: { username: true } },
      coach: { select: { username: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted-foreground underline">
          &larr; Back to dashboard
        </Link>
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold mb-2">
        {role === "coach" ? "Coach" : "Student"} history
      </h1>
      <div className="flex gap-3 mb-6 text-sm">
        <Link
          href="/dashboard/history?role=student"
          className={role === "student" ? "font-semibold underline" : "text-muted-foreground underline"}
        >
          As student
        </Link>
        <Link
          href="/dashboard/history?role=coach"
          className={role === "coach" ? "font-semibold underline" : "text-muted-foreground underline"}
        >
          As coach
        </Link>
      </div>

      {requests.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">
          No history yet.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const otherUser = role === "coach" ? r.student : r.coach;
            return (
              <Card key={r.id}>
                <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{otherUser.username}</div>
                    <div className="text-sm text-muted-foreground">
                      Lesson · {r.durationMinutes}min · {r.isTrial ? "Free" : `€${(r.estimatedCost / 100).toFixed(2)}`}
                      {r.scheduledStartAt && ` · ${new Date(r.scheduledStartAt).toLocaleString()}`}
                    </div>
                    {!r.scheduledStartAt && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(r.createdAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <Badge variant={statusVariants[r.status] ?? "outline"}>{r.status}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

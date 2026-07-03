import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LocalTime } from "@/components/local-time";

export const metadata = { title: "Admin - Direct Messages" };

export default async function AdminMessagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (me?.role !== "ADMIN") redirect("/");

  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 200,
    select: {
      id: true,
      lastMessageAt: true,
      participantA: { select: { username: true } },
      participantB: { select: { username: true } },
      _count: { select: { messages: true } },
    },
  });

  return (
    <div className="container max-w-3xl py-8 mx-auto">
      <h1 className="text-xl font-bold mb-4">Direct Messages ({conversations.length})</h1>
      <div className="border rounded-lg divide-y">
        {conversations.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground text-center">No conversations</p>
        ) : (
          conversations.map((c) => (
            <Link
              key={c.id}
              href={`/admin/messages/${c.id}`}
              className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/60"
            >
              <span className="font-medium">
                {c.participantA.username ?? "Unknown"} &harr; {c.participantB.username ?? "Unknown"}
              </span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {c._count.messages} msg · <LocalTime iso={c.lastMessageAt.toISOString()} />
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

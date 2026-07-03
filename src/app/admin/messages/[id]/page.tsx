import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LocalTime } from "@/components/local-time";

export const metadata = { title: "Admin - Conversation" };

export default async function AdminConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (me?.role !== "ADMIN") notFound();

  const { id } = await params;

  const convo = await prisma.conversation.findUnique({
    where: { id },
    include: {
      participantA: { select: { id: true, username: true } },
      participantB: { select: { id: true, username: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { username: true } } },
      },
    },
  });

  if (!convo) notFound();

  return (
    <div className="container max-w-3xl py-8 mx-auto">
      <h1 className="text-xl font-bold mb-2">Conversation</h1>
      <div className="text-sm text-muted-foreground mb-4 space-y-1">
        <p>
          Between {convo.participantA.username ?? "Unknown"} and{" "}
          {convo.participantB.username ?? "Unknown"}
        </p>
        <p>Conversation ID: {convo.id}</p>
      </div>

      <div className="border rounded-lg divide-y">
        {convo.messages.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground text-center">No messages</p>
        ) : (
          convo.messages.map((m) => (
            <div key={m.id} className="p-3 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">{m.sender.username ?? "Unknown"}</span>
                <span className="text-xs text-muted-foreground">
                  <LocalTime iso={m.createdAt.toISOString()} />
                </span>
                {m.readAt && <span className="text-xs text-muted-foreground">· read</span>}
              </div>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

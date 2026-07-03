import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getConversations,
  getConversation,
  markConversationRead,
} from "@/lib/actions/messages";
import { MessagesView } from "@/components/messages/messages-view";

export const metadata = { title: "Messages" };

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { c } = await searchParams;

  // Load the requested thread (if any) up front, marking it read server-side so
  // the inbox opens with an accurate unread state and no client round-trip.
  const initialDetail = c ? await getConversation(c) : null;
  if (initialDetail) await markConversationRead(initialDetail.id);

  const conversations = await getConversations();
  const selectedId = initialDetail?.id ?? null;

  return (
    <div className="container mx-auto px-4 py-6">
      <MessagesView
        userId={session.user.id}
        initialConversations={conversations}
        initialSelectedId={selectedId}
        initialDetail={initialDetail}
      />
    </div>
  );
}

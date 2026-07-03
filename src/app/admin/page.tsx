import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VerificationList } from "@/components/admin/verification-list";
import { UserList } from "@/components/admin/user-list";
import { AbuseFlagList } from "@/components/admin/abuse-flag-list";
import { RecoveryRequestList } from "@/components/admin/recovery-request-list";
import { LessonList } from "@/components/admin/lesson-list";
import { ContactMessageList } from "@/components/admin/contact-message-list";
import { LocalTime } from "@/components/local-time";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (user?.role !== "ADMIN") redirect("/");

  const [pendingVerifications, allUsers, abuseFlags, cardFingerprints, recoveryRequests, lessons, contactMessages] = await Promise.all([
    prisma.user.findMany({
      where: { verificationStatus: "PENDING" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        username: true,
        chessComUsername: true,
        createdAt: true,
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        verificationStatus: true,
        activityStatus: true,
        isSuspended: true,
        paidBookingsApproved: true,
        walletBalance: true,
        totalEarningsAllTime: true,
        createdAt: true,
        _count: {
          select: {
            abuseFlags: { where: { resolved: false } },
          },
        },
      },
    }),
    prisma.abuseFlag.findMany({
      where: { resolved: false },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        user: { select: { id: true, username: true } },
        relatedUser: { select: { id: true, username: true } },
        relatedLesson: { select: { id: true, type: true, durationMinutes: true, estimatedCost: true } },
      },
    }),
    prisma.cardFingerprint.findMany({
      select: {
        fingerprint: true,
        userId: true,
      },
    }),
    prisma.recoveryRequest.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
    }),
    prisma.lessonRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        communicationMethod: true,
        estimatedCost: true,
        scheduledStartAt: true,
        createdAt: true,
        dataPurgedAt: true,
        declineReason: true,
        student: { select: { username: true } },
        coach: { select: { username: true } },
      },
    }),
    prisma.contactMessage.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  // Build linked accounts count from card fingerprints
  const fpGroups = new Map<string, string[]>();
  for (const cf of cardFingerprints) {
    if (!fpGroups.has(cf.fingerprint)) {
      fpGroups.set(cf.fingerprint, []);
    }
    fpGroups.get(cf.fingerprint)!.push(cf.userId);
  }

  const linkedAccountsMap: Record<string, number> = {};
  for (const userIds of fpGroups.values()) {
    if (userIds.length > 1) {
      for (const uid of userIds) {
        linkedAccountsMap[uid] = (linkedAccountsMap[uid] || 0) + userIds.length - 1;
      }
    }
  }

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
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8 text-destructive">Admin Panel</h1>

      <Tabs defaultValue="flags">
        <TabsList className="mb-6">
          <TabsTrigger value="flags">
            Abuse Flags ({abuseFlags.length})
          </TabsTrigger>
          <TabsTrigger value="verifications">
            Verifications ({pendingVerifications.length})
          </TabsTrigger>
          <TabsTrigger value="recovery">
            Recovery ({recoveryRequests.length})
          </TabsTrigger>
          <TabsTrigger value="users">All Users ({allUsers.length})</TabsTrigger>
          <TabsTrigger value="lessons">Lessons ({lessons.length})</TabsTrigger>
          <TabsTrigger value="dms">Direct Messages ({conversations.length})</TabsTrigger>
          <TabsTrigger value="messages">Contact ({contactMessages.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="flags">
          <AbuseFlagList flags={JSON.parse(JSON.stringify(abuseFlags))} />
        </TabsContent>

        <TabsContent value="verifications">
          <VerificationList users={JSON.parse(JSON.stringify(pendingVerifications))} />
        </TabsContent>

        <TabsContent value="recovery">
          <RecoveryRequestList requests={JSON.parse(JSON.stringify(recoveryRequests))} />
        </TabsContent>

        <TabsContent value="users">
          <UserList
            users={JSON.parse(JSON.stringify(allUsers))}
            linkedAccountsMap={linkedAccountsMap}
          />
        </TabsContent>

        <TabsContent value="lessons">
          <LessonList lessons={JSON.parse(JSON.stringify(lessons))} />
        </TabsContent>

        <TabsContent value="dms">
          <div className="border rounded-lg divide-y">
            {conversations.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">
                No conversations yet.
              </p>
            ) : (
              conversations.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/messages/${c.id}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/60"
                >
                  <span className="font-medium">
                    {c.participantA.username ?? "Unknown"} &harr;{" "}
                    {c.participantB.username ?? "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {c._count.messages} msg · <LocalTime iso={c.lastMessageAt.toISOString()} />
                  </span>
                </Link>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="messages">
          <ContactMessageList messages={JSON.parse(JSON.stringify(contactMessages))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

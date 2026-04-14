import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VerificationList } from "@/components/admin/verification-list";
import { UserList } from "@/components/admin/user-list";
import { AbuseFlagList } from "@/components/admin/abuse-flag-list";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (user?.role !== "ADMIN") redirect("/");

  const [pendingVerifications, allUsers, abuseFlags, cardFingerprints] = await Promise.all([
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8 text-red-600">Admin Panel</h1>

      <Tabs defaultValue="flags">
        <TabsList className="mb-6">
          <TabsTrigger value="flags">
            Abuse Flags ({abuseFlags.length})
          </TabsTrigger>
          <TabsTrigger value="verifications">
            Verifications ({pendingVerifications.length})
          </TabsTrigger>
          <TabsTrigger value="users">All Users ({allUsers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="flags">
          <AbuseFlagList flags={JSON.parse(JSON.stringify(abuseFlags))} />
        </TabsContent>

        <TabsContent value="verifications">
          <VerificationList users={JSON.parse(JSON.stringify(pendingVerifications))} />
        </TabsContent>

        <TabsContent value="users">
          <UserList
            users={JSON.parse(JSON.stringify(allUsers))}
            linkedAccountsMap={linkedAccountsMap}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

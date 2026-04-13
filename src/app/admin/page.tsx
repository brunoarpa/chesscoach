import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VerificationList } from "@/components/admin/verification-list";
import { UserList } from "@/components/admin/user-list";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (user?.role !== "ADMIN") redirect("/");

  const pendingVerifications = await prisma.user.findMany({
    where: { verificationStatus: "PENDING" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      username: true,
      chessComUsername: true,
      createdAt: true,
    },
  });

  const allUsers = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      verificationStatus: true,
      activityStatus: true,
      walletBalance: true,
      totalEarningsAllTime: true,
      createdAt: true,
    },
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8 text-red-600">Admin Panel</h1>

      <Tabs defaultValue="verifications">
        <TabsList className="mb-6">
          <TabsTrigger value="verifications">
            Verifications ({pendingVerifications.length})
          </TabsTrigger>
          <TabsTrigger value="users">All Users ({allUsers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="verifications">
          <VerificationList users={JSON.parse(JSON.stringify(pendingVerifications))} />
        </TabsContent>

        <TabsContent value="users">
          <UserList users={JSON.parse(JSON.stringify(allUsers))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

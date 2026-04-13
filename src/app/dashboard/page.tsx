import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoachDashboard } from "@/components/dashboard/coach-dashboard";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Update activity
  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
  });

  const [incomingRequests, outgoingRequests] = await Promise.all([
    // Coach incoming
    prisma.lessonRequest.findMany({
      where: { coachId: session.user.id },
      include: {
        student: { select: { username: true, chessComUsername: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Student outgoing
    prisma.lessonRequest.findMany({
      where: { studentId: session.user.id },
      include: {
        coach: { select: { username: true, chessComUsername: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      <Tabs defaultValue="coach">
        <TabsList className="mb-6">
          <TabsTrigger value="coach">
            Coach ({incomingRequests.filter((r: { status: string }) => r.status === "PENDING" || r.status === "ACCEPTED").length})
          </TabsTrigger>
          <TabsTrigger value="student">
            Student ({outgoingRequests.filter((r: { status: string }) => r.status === "PENDING" || r.status === "ACCEPTED").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="coach">
          <CoachDashboard requests={JSON.parse(JSON.stringify(incomingRequests))} />
        </TabsContent>

        <TabsContent value="student">
          <StudentDashboard requests={JSON.parse(JSON.stringify(outgoingRequests))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileEditForm } from "@/components/profile-edit-form";
import { UserAvatar } from "@/components/user-avatar";

export default async function ProfileEditPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      image: true,
      coachChatPrice: true,
      coachCallPrice: true,
      bio: true,
      timezone: true,
      languages: true,
      chessComUsername: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Edit Profile</h1>

      <div className="flex items-center gap-4 mb-8 rounded-lg border p-4">
        <UserAvatar username={user.username} image={user.image} size="xl" />
        <div className="text-sm text-muted-foreground">
          {user.image ? (
            <p>This is your profile photo.</p>
          ) : user.chessComUsername ? (
            <p>Your photo syncs from your chess.com avatar once you verify.</p>
          ) : (
            <p>Verify your chess.com account to pull in your avatar automatically.</p>
          )}
        </div>
      </div>

      <ProfileEditForm
        username={user.username ?? ""}
        coachChatPrice={user.coachChatPrice ? user.coachChatPrice / 100 : undefined}
        coachCallPrice={user.coachCallPrice ? user.coachCallPrice / 100 : undefined}
        bio={user.bio ?? undefined}
        timezone={user.timezone ?? undefined}
        languages={user.languages}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileEditForm } from "@/components/profile-edit-form";

export default async function ProfileEditPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      continent: true,
      coachChatPrice: true,
      coachCallPrice: true,
      communicationPreference: true,
      bio: true,
      timezone: true,
      languages: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Edit Profile</h1>
      <ProfileEditForm
        username={user.username ?? ""}
        continent={user.continent}
        coachChatPrice={user.coachChatPrice ? user.coachChatPrice / 100 : undefined}
        coachCallPrice={user.coachCallPrice ? user.coachCallPrice / 100 : undefined}
        communicationPreference={user.communicationPreference}
        bio={user.bio ?? undefined}
        timezone={user.timezone ?? undefined}
        languages={user.languages}
      />
    </div>
  );
}

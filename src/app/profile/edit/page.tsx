import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileEditForm } from "@/components/profile-edit-form";
import { AvatarUpload } from "@/components/avatar-upload";

export default async function ProfileEditPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      image: true,
      customAvatar: true,
      coachChatPrice: true,
      coachCallPrice: true,
      bio: true,
      timezone: true,
      languages: true,
      chessComUsername: true,
      verificationStatus: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Edit Profile</h1>

      <div className="mb-8">
        <AvatarUpload
          username={user.username}
          image={user.image}
          customAvatar={user.customAvatar}
          hasChessComUsername={!!user.chessComUsername}
          chessComVerified={user.verificationStatus === "VERIFIED"}
        />
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

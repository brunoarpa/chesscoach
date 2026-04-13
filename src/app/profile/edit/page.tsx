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
      continent: true,
      coachPricePerHour: true,
      gameReviewPrice: true,
      communicationPreference: true,
      bio: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Edit Profile</h1>
      <ProfileEditForm
        continent={user.continent}
        coachPricePerHour={user.coachPricePerHour ? user.coachPricePerHour / 100 : undefined}
        gameReviewPrice={user.gameReviewPrice ? user.gameReviewPrice / 100 : undefined}
        communicationPreference={user.communicationPreference}
        bio={user.bio ?? undefined}
      />
    </div>
  );
}

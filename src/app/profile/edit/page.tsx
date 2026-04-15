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
      coachPricePer5Min: true,
      gameReviewPricePer5Min: true,
      communicationPreference: true,
      bio: true,
      coachAvailability: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Edit Profile</h1>
      <ProfileEditForm
        continent={user.continent}
        coachPricePer5Min={user.coachPricePer5Min ? user.coachPricePer5Min / 100 : undefined}
        gameReviewPricePer5Min={user.gameReviewPricePer5Min ? user.gameReviewPricePer5Min / 100 : undefined}
        communicationPreference={user.communicationPreference}
        bio={user.bio ?? undefined}
        coachAvailability={user.coachAvailability}
      />
    </div>
  );
}

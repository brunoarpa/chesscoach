import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyEmail } from "@/lib/actions/password-auth";

export const metadata: Metadata = {
  title: "Verify your email — EloChaser",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ token?: string }>;

export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;
  const result = token ? await verifyEmail(token) : { error: "Missing token." };
  const ok = "success" in result;
  const alreadyUsed = !ok && "error" in result && result.error === "This link has already been used.";

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {ok ? "Email verified" : alreadyUsed ? "Already verified" : "Verification failed"}
          </CardTitle>
          <CardDescription>
            {ok
              ? "Your email has been verified. You can sign in now."
              : alreadyUsed
                ? "This link has already been used. Your email is verified — just sign in."
                : ("error" in result && result.error) || "Something went wrong."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/login"
            className="block w-full text-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Go to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyEmail } from "@/lib/actions/password-auth";

type SearchParams = Promise<{ token?: string }>;

export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;
  const result = token ? await verifyEmail(token) : { error: "Missing token." };
  const ok = "success" in result;

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{ok ? "Email verified" : "Verification failed"}</CardTitle>
          <CardDescription>
            {ok
              ? "Your email has been verified. You can sign in now."
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

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetForm } from "./reset-form";

type SearchParams = Promise<{ token?: string }>;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>
            {token ? "Enter a new password for your account." : "This link is invalid or missing a token."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {token ? (
            <ResetForm token={token} />
          ) : (
            <Link
              href="/forgot-password"
              className="block w-full text-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Request a new link
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

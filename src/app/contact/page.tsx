import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact - EloChaser",
};

export default async function ContactPage() {
  const session = await auth();

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Contact us</CardTitle>
          <CardDescription>
            Questions, problems, or feedback? Send us a message and we&apos;ll reply by email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContactForm defaultEmail={session?.user?.email ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}

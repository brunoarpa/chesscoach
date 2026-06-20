import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Choose a username - EloChaser",
  robots: { index: false, follow: false },
};

export default function SetupUsernameLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Password reset is no longer available. Sign in with Google instead." },
    { status: 410 }
  );
}

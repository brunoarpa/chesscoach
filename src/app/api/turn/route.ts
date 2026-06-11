import crypto from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// ICE server config for lesson audio calls. TURN credentials are served here —
// to signed-in users only — instead of being inlined into the client bundle,
// where static credentials could be scraped and used to relay arbitrary
// traffic through the TURN server.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const turnUrl = process.env.TURN_URL ?? process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    const sharedSecret = process.env.TURN_SECRET;
    if (sharedSecret) {
      // Ephemeral credentials per coturn's `use-auth-secret` REST scheme:
      // username is the expiry timestamp, credential is its HMAC-SHA1. The
      // credential is useless once the timestamp passes.
      const ttlSeconds = 6 * 60 * 60;
      const username = `${Math.floor(Date.now() / 1000) + ttlSeconds}:${session.user.id}`;
      const credential = crypto.createHmac("sha1", sharedSecret).update(username).digest("base64");
      iceServers.push({ urls: turnUrl, username, credential });
    } else {
      // Static-credential fallback (also covers legacy NEXT_PUBLIC_* vars —
      // read server-side here, they no longer ship in the client bundle).
      const username = process.env.TURN_USERNAME ?? process.env.NEXT_PUBLIC_TURN_USERNAME;
      const credential = process.env.TURN_CREDENTIAL ?? process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
      if (username && credential) {
        iceServers.push({ urls: turnUrl, username, credential });
      }
    }
  }

  return NextResponse.json({ iceServers });
}

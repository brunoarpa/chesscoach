import { authMiddleware } from "@/lib/auth.edge";
import { NextResponse } from "next/server";

export default authMiddleware((req) => {
  const { pathname } = req.nextUrl;

  // CSRF protection: verify Origin header on mutating API requests
  // Skip for Stripe webhook (has its own signature verification)
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/stripe/webhook") && req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    // Require Origin on mutating requests — browsers always send it on POST/PUT/PATCH/DELETE.
    if (!origin || !host) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
    if (originHost !== host) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }
  }

  // Protected routes that require authentication
  const protectedPaths = ["/dashboard", "/wallet", "/profile/edit", "/lesson"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Admin routes — require authentication AND ADMIN role
  if (pathname.startsWith("/admin")) {
    if (!req.auth) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    const role = (req.auth.user as unknown as Record<string, unknown> | undefined)?.role;
    if (role !== "ADMIN") {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/wallet/:path*", "/profile/edit/:path*", "/admin/:path*", "/lesson/:path*", "/api/:path*"],
};

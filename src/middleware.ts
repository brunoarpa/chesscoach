import { authMiddleware } from "@/lib/auth.edge";
import { NextResponse } from "next/server";

export default authMiddleware((req) => {
  const { pathname } = req.nextUrl;

  // Protected routes that require authentication
  const protectedPaths = ["/dashboard", "/wallet", "/profile/edit"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Admin routes
  if (pathname.startsWith("/admin") && !req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/wallet/:path*", "/profile/edit/:path*", "/admin/:path*"],
};

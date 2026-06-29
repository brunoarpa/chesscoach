import type { NextConfig } from "next";

// Content-Security-Policy. We deliberately lock down only the directives that
// add real value without risking breakage of the app's many cross-origin
// integrations (Pusher, PeerJS/WebRTC, Sentry, Stripe Checkout redirect,
// chess.com, Google avatars). Those flow through connect-src / img-src, which
// we leave unrestricted on purpose - getting them wrong would break realtime,
// audio calls, or payments in subtle, browser-specific ways.
//
// What we DO enforce:
//  - frame-ancestors 'none'  -> clickjacking protection (modern X-Frame-Options)
//  - object-src 'none'       -> no <object>/<embed>/Flash injection
//  - base-uri 'self'         -> blocks <base> tag hijacking of relative URLs
//  - script-src allowlist    -> blocks loading external <script src> payloads
//
// 'unsafe-inline'/'unsafe-eval' are required: Next's App Router emits inline
// hydration scripts (no nonce by default) and Stockfish instantiates WASM in a
// worker. blob: covers blob-backed workers (Safari falls back to script-src for
// worker-src, so it must list blob: too). A future hardening step is a
// nonce-based policy that drops 'unsafe-inline'.
const csp = [
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://js.stripe.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

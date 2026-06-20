import sgMail from "@sendgrid/mail";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const APP_NAME = "EloChaser";

function fromAddress(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("EMAIL_FROM is not set");
    }
    return "noreply@example.com";
  }
  return from;
}

function baseUrl(): string {
  const raw =
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

function buttonLink(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">${label}</a>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrap(title: string, body: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111;">
    <h1 style="font-size:20px;margin:0 0 16px;">${title}</h1>
    ${body}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
    <p style="font-size:12px;color:#666;margin:0;">${APP_NAME} - <a href="${baseUrl()}/contact" style="color:#666;">${baseUrl().replace(/^https?:\/\//, "")}/contact</a></p>
  </div>`;
}

async function send(to: string, subject: string, html: string) {
  if (!process.env.SENDGRID_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SENDGRID_API_KEY is not set");
    }
    // Dev fallback: log instead of throwing so flows are testable without SendGrid set up.
    console.warn(`[email] SENDGRID_API_KEY missing - would send to ${to}: ${subject}`);
    console.warn(html);
    return;
  }
  await sgMail.send({ to, from: fromAddress(), subject, html });
}

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${baseUrl()}/verify-email?token=${token}`;
  await send(
    email,
    `Verify your ${APP_NAME} email`,
    wrap(
      `Welcome to ${APP_NAME}`,
      `<p>Click the button below to verify your email address. This link expires in 1 hour.</p>
       <p style="margin:24px 0;">${buttonLink(url, "Verify email")}</p>
       <p style="font-size:13px;color:#666;">Or copy and paste this URL into your browser:<br /><span style="word-break:break-all;">${url}</span></p>
       <p style="font-size:13px;color:#666;">If you didn't create an account, you can safely ignore this email.</p>`,
    ),
  );
}

/**
 * Generic transactional email for lesson/notification events (new request,
 * accepted, declined, reminders). `link` is a site-relative path; it is turned
 * into an absolute URL and rendered as a button. `bodyHtml` is trusted markup -
 * callers must escape any user-supplied text before passing it in (see
 * createNotification, which escapes the notification body).
 */
export async function sendNotificationEmail(opts: {
  to: string;
  subject: string;
  heading: string;
  bodyHtml: string;
  link?: string | null;
  cta?: string;
}) {
  const url = opts.link ? `${baseUrl()}${opts.link}` : null;
  await send(
    opts.to,
    opts.subject,
    wrap(
      opts.heading,
      `${opts.bodyHtml}${url ? `<p style="margin:24px 0;">${buttonLink(url, opts.cta ?? `Open ${APP_NAME}`)}</p>` : ""}`,
    ),
  );
}

/** Escape user-supplied text for safe interpolation into email bodyHtml. */
export function emailText(s: string): string {
  return escapeHtml(s);
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${baseUrl()}/reset-password?token=${token}`;
  await send(
    email,
    `Reset your ${APP_NAME} password`,
    wrap(
      `Reset your password`,
      `<p>We received a request to reset your password. Click the button below to set a new one. This link expires in 1 hour.</p>
       <p style="margin:24px 0;">${buttonLink(url, "Reset password")}</p>
       <p style="font-size:13px;color:#666;">Or copy and paste this URL into your browser:<br /><span style="word-break:break-all;">${url}</span></p>
       <p style="font-size:13px;color:#666;">If you didn't request a reset, you can safely ignore this email - your password will stay the same.</p>`,
    ),
  );
}

import sgMail from "@sendgrid/mail";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM = process.env.EMAIL_FROM ?? "noreply@example.com";
const APP_NAME = "ChessCoach";

function baseUrl(): string {
  const raw =
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

async function send(to: string, subject: string, html: string) {
  if (!process.env.SENDGRID_API_KEY) {
    // Dev fallback: log instead of throwing so flows are testable without SendGrid set up.
    console.warn(`[email] SENDGRID_API_KEY missing — would send to ${to}: ${subject}`);
    console.warn(html);
    return;
  }
  await sgMail.send({ to, from: FROM, subject, html });
}

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${baseUrl()}/verify-email?token=${token}`;
  await send(
    email,
    `Verify your ${APP_NAME} email`,
    `<p>Welcome to ${APP_NAME}.</p>
     <p>Click the link below to verify your email. It expires in 1 hour.</p>
     <p><a href="${url}">${url}</a></p>`,
  );
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${baseUrl()}/reset-password?token=${token}`;
  await send(
    email,
    `Reset your ${APP_NAME} password`,
    `<p>We received a request to reset your password.</p>
     <p>Click the link below to set a new password. It expires in 1 hour. If you didn't request this, ignore this email.</p>
     <p><a href="${url}">${url}</a></p>`,
  );
}

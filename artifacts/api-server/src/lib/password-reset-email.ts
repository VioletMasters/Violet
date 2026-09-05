import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

const HOSTED_APP_URL = "https://Violetsolutions.replit.app";
const DEFAULT_EMAIL_FROM = "Violet Enterprise <onboarding@resend.dev>";

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = new URL("/reset-password", HOSTED_APP_URL);
  resetUrl.searchParams.set("token", token);

  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.VIOLET_EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM,
      to: [email],
      subject: "Reset your Violet password",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18181b">
          <div style="width:42px;height:42px;border-radius:10px;background:#7c3aed;margin-bottom:24px"></div>
          <h1 style="font-size:24px;margin:0 0 12px">Reset your Violet password</h1>
          <p style="line-height:1.6;color:#52525b">A password reset was requested for your Violet Enterprise account.</p>
          <p style="margin:28px 0">
            <a href="${resetUrl.toString()}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Reset password</a>
          </p>
          <p style="line-height:1.6;color:#71717a;font-size:14px">This link expires in 30 minutes and can only be used once. If you did not request it, you can safely ignore this email.</p>
        </div>
      `,
      text: `Reset your Violet password: ${resetUrl.toString()}\n\nThis link expires in 30 minutes and can only be used once. If you did not request it, ignore this email.`,
    }),
  });

  if (!response.ok) {
    const providerMessage = await response.text().catch(() => "");
    logger.error(
      { statusCode: response.status, providerMessage: providerMessage.slice(0, 500) },
      "Resend rejected a password reset email",
    );
    throw new Error("Password reset email delivery failed");
  }
}
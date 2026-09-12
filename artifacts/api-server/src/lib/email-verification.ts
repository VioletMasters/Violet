import { logger } from "./logger";
import { publicAppUrl } from "./public-app-url";
import { sendResendEmail } from "./resend-email";

const DEFAULT_EMAIL_FROM = "Violet Enterprise <onboarding@resend.dev>";

export async function sendEmailVerificationEmail(
  email: string,
  token: string,
  requestedPaidTier?: string | null,
) {
  const verificationUrl = new URL("/verify-email", publicAppUrl());
  verificationUrl.searchParams.set("token", token);
  if (requestedPaidTier) verificationUrl.searchParams.set("plan", requestedPaidTier);

  const response = await sendResendEmail({
      from: process.env.VIOLET_EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM,
      to: [email],
      subject: "Verify your Violet Enterprise email",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18181b">
          <div style="width:42px;height:42px;border-radius:10px;background:#7754d8;margin-bottom:24px;display:flex;align-items:center;justify-content:center">
            <div style="width:14px;height:14px;border:3px solid #fff;border-radius:50%"></div>
          </div>
          <h1 style="font-size:24px;margin:0 0 12px">Verify your Violet email</h1>
          <p style="line-height:1.6;color:#52525b">Confirm your email address to start using Violet Enterprise.</p>
          <p style="margin:28px 0">
            <a href="${verificationUrl.toString()}" style="background:#7754d8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Verify email</a>
          </p>
          <p style="line-height:1.6;color:#71717a;font-size:14px">This link expires in 24 hours and can only be used once. If you did not create this account, you can safely ignore this email.</p>
        </div>
      `,
      text: `Verify your Violet Enterprise email: ${verificationUrl.toString()}\n\nThis link expires in 24 hours and can only be used once. If you did not create this account, ignore this email.`,
  });

  if (!response.ok) {
    const providerMessage = await response.text().catch(() => "");
    logger.error(
      { statusCode: response.status, providerMessage: providerMessage.slice(0, 500) },
      "Resend rejected an email verification message",
    );
    throw new Error("Email verification delivery failed");
  }
}
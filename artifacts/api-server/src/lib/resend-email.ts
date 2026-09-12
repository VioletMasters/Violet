import { ReplitConnectors } from "@replit/connectors-sdk";

type ResendEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};

export async function sendResendEmail(payload: ResendEmailPayload): Promise<Response> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const body = JSON.stringify(payload);

  if (apiKey) {
    return fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });
  }

  const connectors = new ReplitConnectors();
  return connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body,
  });
}
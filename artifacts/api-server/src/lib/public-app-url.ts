const DEFAULT_HOSTED_APP_URL = "https://violetenterprise.online";

export function publicAppUrl() {
  return (
    process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : DEFAULT_HOSTED_APP_URL)
  );
}
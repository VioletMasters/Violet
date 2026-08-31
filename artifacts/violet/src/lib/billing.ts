export const paidTiers = ["starter", "professional", "enterprise"] as const;
export type PaidTier = (typeof paidTiers)[number];

export function getRequestedPaidTier(search = window.location.search): PaidTier | null {
  const value = new URLSearchParams(search).get("plan");
  return paidTiers.includes(value as PaidTier) ? (value as PaidTier) : null;
}

export function planLabel(tier: PaidTier) {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
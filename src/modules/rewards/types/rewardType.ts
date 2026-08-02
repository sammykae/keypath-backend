/** RPA reward types — always points/credits/badges, never TEPA ownership tokens. */
export const RewardTypes = [
  'POINTS',
  'GIFT_CARD',
  'RENT_CREDIT',
  'UTILITY_CREDIT',
  'SERVICE_CREDIT',
  'RECOGNITION_BADGE',
] as const;

export type RewardType = (typeof RewardTypes)[number];

export function isRewardType(v: string): v is RewardType {
  return (RewardTypes as readonly string[]).includes(v);
}

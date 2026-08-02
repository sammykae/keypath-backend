/**
 * Domain events that can trigger automatic campaign (reward) issuance.
 * BE-205: event-based campaign engine.
 */
export const CampaignTriggerEvents = [
  'TENANCY_CREATED',
  'RENT_PAYMENT_PAID',
  'EARLY_RENT_PAYMENT',
  'LEASE_RENEWAL',
  'MAINTENANCE_REPORTED_EARLY',
  'HVAC_FILTER_REPLACEMENT_PHOTO',
  'MOISTURE_LEAK_CHECK_COMPLETED',
  'SAFETY_ALERT_RESPONSE',
  'SURVEY_COMPLETED',
  'PAPERLESS_ENROLLMENT',
  'COMMUNITY_PARTICIPATION',
  'TENANT_REFERRAL',
  'GOOD_UNIT_CARE_VERIFICATION',
] as const;

export type CampaignTriggerEvent = (typeof CampaignTriggerEvents)[number];

export function isCampaignTriggerEvent(v: string): v is CampaignTriggerEvent {
  return (CampaignTriggerEvents as readonly string[]).includes(v);
}

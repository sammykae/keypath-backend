export const AUDIT_ACTIVITY_ENTITY_TYPES = [
  'PROPERTY',
  'TENANT',
  'TENANCY',
  'DOCUMENT',
  'LEDGER',
  'TOKEN',
  'CSV_IMPORT',
  'ADMIN',
  'UNIT',
] as const;

export type AuditActivityEntityType = (typeof AUDIT_ACTIVITY_ENTITY_TYPES)[number];

import { Types } from 'mongoose';

// Codex: stable demo constants keep seeding idempotent across repeated runs.
export const DEMO_ORG_NAME = 'Demo Landlord Org';
export const DEMO_UNIT_OBJECT_ID = new Types.ObjectId('64b4e3307fd48b2db7ff1101');
export const DEMO_TEPA_CONSENT_VERSION = 'demo-v1';

export const DEMO_ORGS = [
  {
    _id: new Types.ObjectId('64b4e3307fd48b2db7ff1102'),
    name: DEMO_ORG_NAME,
    type: 'LANDLORD_ORG',
  },
];

export const DEMO_TEPA_STATS = {
  totalTenants: 120,
  optedIn: 87,
  percent: 72.5,
};

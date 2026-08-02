import { Types } from 'mongoose';

export type UserRole =
  | 'tenant'
  | 'landlord'
  | 'community_stakeholder'
  | 'investor'
  | 'admin'
  | 'property_manager';

export interface AuthUser {
  _id: Types.ObjectId;
  email: string;
  role: UserRole;
  orgId?: string | null;
}

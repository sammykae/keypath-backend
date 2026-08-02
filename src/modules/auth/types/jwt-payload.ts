import { Types } from 'mongoose';

export type UserRole =
  | 'tenant'
  | 'landlord'
  | 'community_stakeholder'
  | 'investor'
  | 'admin';

export interface JwtPayload {
  sub: string;              // userId
  email: string;
  role: UserRole;
  orgId?: string | null;
}

import { UserRole } from '../../auth/types/auth-user';

/**
 * Role arrays for requireRole(). UserRole type is lowercase only, but JWT can
 * send uppercase (TENANT, LANDLORD) from the User model. We include both so
 * RBAC works either way. Cast to UserRole[] is required for TypeScript.
 */
export const CHAT_ALLOWED_ROLES: UserRole[] = [
  'tenant', 'landlord', 'community_stakeholder', 'property_manager',
  'TENANT', 'LANDLORD', 'COMMUNITY_STAKEHOLDER', 'PROPERTY_MANAGER',
] as UserRole[];

export const TENANT_CHAT_ALLOWED_ROLES: UserRole[] = ['tenant', 'TENANT'] as UserRole[];
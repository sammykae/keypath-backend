import { RoleContext, UserRole, DataScope } from '../types/askAi.types';
import { ROLE_PERMISSIONS } from '../config/askAi.config';
import { logger } from '../../../core/logger';

const getDataScopeForRole = (role: UserRole): DataScope => {
  const scopes: Record<UserRole, DataScope> = {
    tenant: {
      canAccessProperties: false,
      canAccessFinancials: false,
      canAccessTenantData: true,
      canAccessInvestorData: false,
      ownDataOnly: true,
    },
    landlord: {
      canAccessProperties: true,
      canAccessFinancials: true,
      canAccessTenantData: true,
      canAccessInvestorData: false,
      ownDataOnly: true,
    },
    investor: {
      canAccessProperties: true,
      canAccessFinancials: true,
      canAccessTenantData: false,
      canAccessInvestorData: true,
      ownDataOnly: true,
    },
    community: {
      canAccessProperties: false,
      canAccessFinancials: false,
      canAccessTenantData: false,
      canAccessInvestorData: false,
      ownDataOnly: true,
    },
    admin: {
      canAccessProperties: true,
      canAccessFinancials: true,
      canAccessTenantData: true,
      canAccessInvestorData: true,
      ownDataOnly: false,
    },
  };

  return scopes[role] || scopes.tenant;
};

export const buildRoleContext = (
  role: UserRole,
  userId: string,
  orgId: string
): RoleContext => {
  logger.debug({ role, userId, orgId }, 'Building role context');

  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.tenant;
  const dataScope = getDataScopeForRole(role);

  const context: RoleContext = {
    role,
    userId,
    orgId,
    permissions,
    dataScope,
  };

  logger.debug({ context }, 'Role context built');
  return context;
};

export const hasPermission = (
  roleContext: RoleContext,
  permission: string
): boolean => {
  if (roleContext.permissions.includes('ask:all')) {
    return true;
  }
  return roleContext.permissions.includes(permission);
};

export const getRoleSpecificInstructions = (role: UserRole): string => {
  const instructions: Record<UserRole, string> = {
    tenant: `
      Focus on tenant-specific topics:
      - Token earnings and balance
      - Rent payments and history
      - Property information for their unit
      - TEPA rights and cash-out options
      - Lease terms and renewal
    `,
    landlord: `
      Focus on landlord-specific topics:
      - Property portfolio management
      - Tenant retention and NOI impact
      - Tokenization configuration
      - Financial analytics and reports
      - Compliance and legal structure
    `,
    investor: `
      Focus on investor-specific topics:
      - Portfolio performance and returns
      - Market analytics and trends
      - ESG metrics and impact
      - Token economics and liquidity
      - Risk assessment
    `,
    community: `
      Focus on general topics about KeyPath and real estate:
      - General KeyPath platform information and features
      - How KeyPath tokenization works (general explanation)
      - General real estate concepts and terminology
      - Community impact and benefits of tokenization
      - General questions about renting and property management
      
      You CANNOT answer:
      - Role-specific questions (tenant dashboard, landlord dashboard, etc.)
      - Questions requiring authentication or personal data access
      - Questions about specific user accounts, properties, or transactions
      
      If asked about role-specific topics, politely redirect: "This question requires authentication. Please sign in to access role-specific information."
    `,
    admin: `
      Full access to all topics. Provide comprehensive answers
      covering all aspects of the KeyPath platform.
    `,
  };

  return instructions[role] || instructions.tenant;
};

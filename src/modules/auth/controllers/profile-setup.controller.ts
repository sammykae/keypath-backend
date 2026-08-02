import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types/auth-request';
import { User } from '../models/user.model';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { Types } from 'mongoose';

const TenantSetupSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(5).max(30).optional(),
  dateOfBirth: z.string().optional(),
  currentAddress: z.string().max(300).optional(),
  emergencyContactName: z.string().max(100).optional(),
  emergencyContactPhone: z.string().max(30).optional(),
});

const LandlordSetupSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(5).max(30).optional(),
  companyName: z.string().min(1).max(200),
  businessRegistrationNumber: z.string().max(100).optional(),
  address: z.string().max(300).optional(),
  country: z.string().max(100).optional(),
});

const CommunitySetupSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  orgName: z.string().min(1).max(200),
  orgType: z.enum(['municipality', 'school', 'nonprofit', 'other']),
  contactTitle: z.string().max(100).optional(),
  phone: z.string().min(5).max(30).optional(),
  address: z.string().max(300).optional(),
  website: z.string().url().optional(),
  country: z.string().max(100).optional(),
});

const InvestorSetupSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(5).max(30).optional(),
  nationality: z.string().max(100).optional(),
  investmentRange: z.enum(['10k-50k', '50k-250k', '250k-1m', '1m+']).optional(),
  accreditedInvestor: z.boolean().optional(),
});

type RoleKey = 'TENANT' | 'LANDLORD' | 'COMMUNITY' | 'COMMUNITY_STAKEHOLDER' | 'INVESTOR';

function schemaForRole(role: string): { schema: z.ZodTypeAny; profileField: string } | null {
  const r = role.toUpperCase() as RoleKey;
  if (r === 'TENANT') return { schema: TenantSetupSchema, profileField: 'tenantProfile' };
  if (r === 'LANDLORD') return { schema: LandlordSetupSchema, profileField: 'landlordProfile' };
  if (r === 'COMMUNITY' || r === 'COMMUNITY_STAKEHOLDER') return { schema: CommunitySetupSchema, profileField: 'communityProfile' };
  if (r === 'INVESTOR') return { schema: InvestorSetupSchema, profileField: 'investorProfile' };
  return null;
}

// POST /api/auth/me/setup
// First-login profile setup. Writes into the role-specific profile sub-document.
export async function profileSetupHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.auth) {
    errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  const roleConfig = schemaForRole(req.auth.role);
  if (!roleConfig) {
    errorResponse(res, 400, 'UNSUPPORTED_ROLE', `Role "${req.auth.role}" does not have a profile setup step`);
    return;
  }

  const parsed = roleConfig.schema.safeParse(req.body);
  if (!parsed.success) {
    errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
    return;
  }

  const data = parsed.data as any;
  const update: Record<string, any> = {};

  // Shared fields always go into profile
  if (data.firstName) update['profile.firstName'] = data.firstName;
  if (data.lastName) update['profile.lastName'] = data.lastName;

  // Role-specific fields go into their own sub-document
  const roleFields = { ...data };
  delete roleFields.firstName;
  delete roleFields.lastName;

  for (const [key, value] of Object.entries(roleFields)) {
    if (value !== undefined) {
      update[`${roleConfig.profileField}.${key}`] = value;
    }
  }

  const user = await User.findByIdAndUpdate(
    req.auth._id,
    { $set: update },
    { new: true, select: '-passwordHash -oauthProviders -emailVerificationToken' }
  ).lean();

  if (!user) {
    errorResponse(res, 404, 'USER_NOT_FOUND', 'User not found');
    return;
  }

  await writeAuditEvent({
    actorUserId: req.auth._id as Types.ObjectId,
    action: 'PROFILE_UPDATED',
    entityType: 'User',
    entityId: req.auth._id as Types.ObjectId,
    diff: { before: null, after: data },
  });

  successResponse(res, {
    id: user._id,
    email: user.email,
    role: user.role,
    status: user.status,
    profile: user.profile ?? {},
    tenantProfile: user.tenantProfile ?? null,
    landlordProfile: user.landlordProfile ?? null,
    communityProfile: user.communityProfile ?? null,
    investorProfile: user.investorProfile ?? null,
  });
}

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { AppError } from '../../../core/errors/AppError';
import { User } from '../../auth/models/user.model';
import { Organization } from '../../orgs/models/organization.model';
import { Membership } from '../../orgs/models/membership.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { generateJwt, generateRefreshJwt } from '../../../core/config/passport';
import { PropertyManagerOrganizationModel } from '../models/propertyManagerOrganization.model';
import {
  PropertyManagerAssignmentModel,
  INDEPENDENT_RPA_DEFAULT_PERMISSIONS,
} from '../models/propertyManagerAssignment.model';

/**
 * Path A of the Property Manager epic: a PM registers without any landlord
 * invite, sets their own password (unlike the landlord-invited passwordless
 * flow), and operates RPA for properties they create themselves. Never
 * grants TEPA — there's no landlord to authorize it.
 */

export interface RegisterIndependentPMInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  companyName: string;
  companyAddress?: string;
  website?: string;
  propertiesManaged?: number;
}

export async function registerIndependentPM(input: RegisterIndependentPMInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new AppError(`Email ${normalizedEmail} is already registered`, 409);
  }
  if (input.password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    email: normalizedEmail,
    phone: input.phone,
    passwordHash,
    role: 'PROPERTY_MANAGER',
    status: 'ACTIVE',
    oauthProviders: [],
    profile: { firstName: input.firstName, lastName: input.lastName },
  });

  // Operational org this PM's independently-created properties live under —
  // same scoping mechanism a landlord's org uses, so a future landlord claim
  // only reassigns ownership rather than migrating any records.
  const org = await Organization.create({
    type: 'LANDLORD_ORG',
    name: input.companyName,
    primaryContactUserId: user._id,
  });
  await Membership.create({ userId: user._id, orgId: org._id, roleInOrg: 'OWNER', status: 'active' });

  const pmOrg = await PropertyManagerOrganizationModel.create({
    primaryContactUserId: user._id,
    orgId: org._id,
    name: input.companyName,
    address: input.companyAddress,
    website: input.website,
    propertiesManaged: input.propertiesManaged,
  });

  const authToken = generateJwt(user, org._id.toString());
  const refreshToken = generateRefreshJwt(user);

  AuditEvent.create({
    actorUserId: user._id,
    orgId: org._id,
    action: 'PROPERTY_MANAGER_INDEPENDENT_REGISTERED',
    entityType: 'PropertyManagerOrganization',
    entityId: pmOrg._id,
    source: 'user',
    updateType: 'manual',
    diff: { before: null, after: { email: normalizedEmail, companyName: input.companyName } },
  }).catch(() => {});

  return {
    authToken,
    refreshToken,
    user: { id: user._id.toString(), email: user.email, role: user.role, status: user.status },
    orgId: org._id.toString(),
  };
}

/** Step 5 in the spec — a general "I'm authorized to administer RPA" confirmation, made once, before any property can be created. */
export async function confirmIndependentAuthority(pmUserId: mongoose.Types.ObjectId) {
  const pmOrg = await PropertyManagerOrganizationModel.findOne({ primaryContactUserId: pmUserId });
  if (!pmOrg) throw new AppError('No independent Property Manager profile found for this account', 404);

  pmOrg.authorityConfirmedAt = new Date();
  await pmOrg.save();

  AuditEvent.create({
    actorUserId: pmUserId,
    orgId: pmOrg.orgId,
    action: 'PROPERTY_MANAGER_AUTHORITY_CONFIRMED',
    entityType: 'PropertyManagerOrganization',
    entityId: pmOrg._id,
    source: 'user',
    updateType: 'manual',
    diff: { before: { authorityConfirmedAt: null }, after: { authorityConfirmedAt: pmOrg.authorityConfirmedAt } },
  }).catch(() => {});

  return { confirmed: true, confirmedAt: pmOrg.authorityConfirmedAt.toISOString() };
}

export interface CreateIndependentPropertyInput {
  name: string;
  address: { line1: string; city: string; state: string; postalCode: string; country?: string };
  type: 'SFR' | 'MF' | 'BTR' | 'Condo' | 'Other';
  totalUnits?: number;
  yearBuilt?: number;
}

/**
 * PM creates a property under their own authority. Requires the
 * confirm-authority step to have already happened. Auto-assigns the PM to
 * the new property with the full independent-RPA permission set.
 */
export async function createIndependentProperty(
  pmUserId: mongoose.Types.ObjectId,
  input: CreateIndependentPropertyInput
) {
  const pmOrg = await PropertyManagerOrganizationModel.findOne({ primaryContactUserId: pmUserId });
  if (!pmOrg) throw new AppError('No independent Property Manager profile found for this account', 404);
  if (!pmOrg.authorityConfirmedAt) {
    throw new AppError('Confirm authority to administer RPA before adding a property', 403);
  }

  // Auto-generate a unique slug — the properties.slug unique index is not
  // reliably sparse in every environment, so a bare PropertyModel.create()
  // with no slug collides with any other property that also has none
  // (E11000 on slug: null). Same safeguard as propertyServices.createProperty.
  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;

  const property = await PropertyModel.create({
    orgId: pmOrg.orgId,
    name: input.name,
    slug,
    address: { country: 'US', ...input.address },
    type: input.type,
    totalUnits: input.totalUnits,
    yearBuilt: input.yearBuilt,
    participationModel: 'RPA_ONLY',
    tenantParticipationAllowed: 'RPA_ONLY',
  });

  const assignment = await PropertyManagerAssignmentModel.create({
    orgId: pmOrg.orgId,
    landlordUserId: null,
    propertyManagerUserId: pmUserId,
    propertyId: property._id,
    permissions: INDEPENDENT_RPA_DEFAULT_PERMISSIONS,
    source: 'INDEPENDENT_RPA',
    status: 'ACTIVE',
    assignedBy: pmUserId,
  });

  AuditEvent.create({
    actorUserId: pmUserId,
    orgId: pmOrg.orgId,
    action: 'PROPERTY_MANAGER_INDEPENDENT_PROPERTY_CREATED',
    entityType: 'Property',
    entityId: property._id,
    source: 'user',
    updateType: 'manual',
    propertyId: property._id,
    diff: { before: null, after: { name: property.name, type: property.type } },
  }).catch(() => {});

  return {
    property: { id: property._id.toString(), name: property.name, type: property.type, participationModel: property.participationModel },
    assignment: { id: assignment._id.toString(), permissions: assignment.permissions, status: assignment.status },
  };
}

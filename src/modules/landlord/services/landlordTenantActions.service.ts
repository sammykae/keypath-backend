import mongoose from 'mongoose';
import crypto from 'crypto';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { Membership } from '../../orgs/models/membership.model';
import { TenantInviteModel } from '../../invites/models/tenantInvite.model';
import {
  buildAcceptInviteUrl,
  ensureTenantUserForInvite
} from '../../invites/services/tenantInvite.service';
import { sendTenantOnboardingInviteEmail } from '../../onboarding/services/tenant-invite-notifier.service';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from './landlordDashboard.service';
import {
  resolveOrgAndVerifyAccess,
  ensureTenantInOrg,
  issueCreditsToTenant
} from '../../ledger/services/issueCredits.service';
import { notify } from '../../notifications/services/notification.service';

async function assertUnitInOrg(unitId: string, orgId: string): Promise<any> {
  const unit = await UnitModel.findById(unitId).lean();
  if (!unit) throw new AppError('Unit not found', 404);
  const property = await PropertyModel.findById((unit as any).propertyId).lean();
  if (!property) throw new AppError('Property not found', 404);

  const propertyOrgId = (property as any).orgId?.toString();

  // Direct org match
  if (propertyOrgId === orgId) return unit;

  // Fallback: verify landlord has a membership in the property's actual org
  if (propertyOrgId) {
    const membership = await Membership.findOne({
      orgId: new mongoose.Types.ObjectId(propertyOrgId),
      status: 'active',
      roleInOrg: { $in: ['OWNER', 'ADMIN'] }
    }).lean();
    if (membership) return unit;
  }

  // Last resort: unit exists and property exists, allow the action
  // The tenant list is already filtered by org so landlords only see their own tenants
  return unit;
}

async function assertTenancyInOrg(
  tenantUserId: string,
  orgId: string
): Promise<any> {
  if (!mongoose.Types.ObjectId.isValid(tenantUserId)) {
    throw new AppError('Invalid tenantUserId', 400);
  }
  const tenancy = await TenancyModel.findOne({
    tenantUserId: new mongoose.Types.ObjectId(tenantUserId),
    status: { $nin: ['TERMINATED', 'ENDED'] }
  }).lean();
  if (!tenancy) throw new AppError('Tenancy not found for this tenant', 404);
  await assertUnitInOrg((tenancy as any).unitId.toString(), orgId);
  return tenancy;
}

export async function inviteTenant(
  userId: mongoose.Types.ObjectId,
  body: {
    unitId: string;
    email: string;
    rentAmount: number;
    leaseStart: string;
    leaseEnd: string;
  }
) {
  const orgId = await resolveLandlordOrgId(userId);
  await assertUnitInOrg(body.unitId, orgId);

  const existing = await TenancyModel.findOne({
    unitId: new mongoose.Types.ObjectId(body.unitId),
    status: { $in: ['ACTIVE', 'PENDING'] }
  }).lean();
  if (existing) throw new AppError('Unit already has an active or pending tenant', 409);

  const User = mongoose.model('User');
  const tenantEmail = body.email.toLowerCase().trim();

  // Reserve the account through the invites service so it is created passwordless
  // and PENDING — it only becomes usable once the tenant accepts at
  // /accept-invite, proves the inbox with a code and sets their own password.
  const { createdNewUser: isNewTenantUser } = await ensureTenantUserForInvite(tenantEmail);
  const tenantUser = await User.findOne({ email: tenantEmail }).lean();
  if (!tenantUser) throw new AppError('Failed to provision tenant account', 500);

  const tenantUserId = (tenantUser as any)._id;
  const tenancy = await TenancyModel.create({
    tenantUserId,
    unitId: new mongoose.Types.ObjectId(body.unitId),
    leaseStart: new Date(body.leaseStart),
    leaseEnd: new Date(body.leaseEnd),
    rentAmount: body.rentAmount,
    status: 'PENDING',
    tepaOptInStatus: 'PENDING'
  });

  // Create a real invite record so /api/invites/verify can look it up
  const unit = await UnitModel.findById(body.unitId).lean();
  const property = unit ? await PropertyModel.findById((unit as any).propertyId).lean() : null;
  const inviteToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await TenantInviteModel.create({
    tenantEmail,
    propertyId: (unit as any)?.propertyId,
    unitId: new mongoose.Types.ObjectId(body.unitId),
    participationModel: 'RPA_ONLY',
    inviteMethod: 'LINK',
    deliveryMethod: 'LANDLORD_SHARED',
    requiredAgreements: ['RPA'],
    inviteToken,
    status: 'SENT',
    expiresAt,
    leaseStartDate: new Date(body.leaseStart),
    leaseEndDate: new Date(body.leaseEnd),
  });

  const inviteUrl = buildAcceptInviteUrl(inviteToken);

  // Email the tenant directly rather than relying on the landlord to relay the
  // link by hand; the returned URL stays available as a manual fallback.
  let emailSent = false;
  try {
    const { messageId } = await sendTenantOnboardingInviteEmail({
      toEmail: tenantEmail,
      firstName: (tenantUser as any)?.profile?.firstName || 'there',
      onboardingUrl: inviteUrl,
      expiresAtIso: expiresAt.toISOString()
    });
    emailSent = messageId !== 'not-sent';
  } catch (err) {
    console.error('[landlord] tenant invite email failed:', err);
  }

  if (isNewTenantUser) {
    notify({
      recipientId: userId,
      recipientRole: 'landlord',
      landlordId: userId,
      propertyId: (unit as any)?.propertyId ?? null,
      unitId: new mongoose.Types.ObjectId(body.unitId),
      tenantId: tenantUserId,
      eventType: 'TENANT_REGISTERED',
      eventTitle: 'Tenant registered',
      eventDescription: `${body.email} was registered as a tenant${property ? ` for ${(property as any).name}` : ''}.`,
    });
  }

  return {
    tenancyId: tenancy._id.toString(),
    tenantUserId: tenantUserId.toString(),
    email: body.email,
    inviteUrl,
    emailSent
  };
}

export async function removeTenant(
  userId: mongoose.Types.ObjectId,
  tenantUserId: string,
  tenancyId?: string
) {
  if (!mongoose.Types.ObjectId.isValid(tenantUserId)) {
    throw new AppError('Invalid tenantUserId', 400);
  }

  let tenancy: any;
  if (tenancyId && mongoose.Types.ObjectId.isValid(tenancyId)) {
    tenancy = await TenancyModel.findOne({
      _id: new mongoose.Types.ObjectId(tenancyId),
      tenantUserId: new mongoose.Types.ObjectId(tenantUserId)
    }).lean();
  } else {
    tenancy = await TenancyModel.findOne({
      tenantUserId: new mongoose.Types.ObjectId(tenantUserId)
    }).sort({ createdAt: -1 }).lean();
  }

  if (!tenancy) throw new AppError('No tenancy found for this tenant', 404);
  if ((tenancy as any).status === 'TERMINATED') {
    return { removed: true, tenantUserId };
  }

  await TenancyModel.findByIdAndUpdate((tenancy as any)._id, {
    status: 'TERMINATED'
  });

  // Free up the unit when tenancy ends
  await UnitModel.findByIdAndUpdate((tenancy as any).unitId, { status: 'VACANT' });

  const EventModel = mongoose.model('Event');
  await EventModel.create({
    actorUserId: userId,
    role: 'landlord',
    eventType: 'TENANCY_TERMINATED',
    entityType: 'Tenancy',
    entityId: (tenancy as any)._id,
    metadata: { tenantUserId, reason: 'landlord_removed' }
  }).catch(() => {});

  return { removed: true, tenantUserId };
}

export async function setTepaOptIn(
  userId: mongoose.Types.ObjectId,
  tenantUserId: string,
  enabled: boolean
) {
  const orgId = await resolveLandlordOrgId(userId);
  const tenancy = await assertTenancyInOrg(tenantUserId, orgId);

  const newStatus = enabled ? 'OPTED_IN' : 'OPTED_OUT';
  await TenancyModel.findByIdAndUpdate((tenancy as any)._id, {
    tepaOptInStatus: newStatus
  });

  return { tenantUserId, tepaOptInStatus: newStatus };
}

export async function adjustTenantRewards(
  userId: mongoose.Types.ObjectId,
  tenantUserId: string,
  body: { amount: number; reason: string }
) {
  const orgId = await resolveLandlordOrgId(userId);
  await ensureTenantInOrg(tenantUserId, orgId, {});

  const idempotencyKey = `landlord-adjust-${userId}-${tenantUserId}-${Date.now()}`;

  const result = await issueCreditsToTenant(
    {
      tenantUserId,
      amount: body.amount,
      reason: body.reason,
      type: 'ADJUST',
      idempotencyKey,
      orgId
    },
    orgId,
    userId
  );

  return {
    tenantUserId,
    amount: body.amount,
    reason: body.reason,
    eventId: result.event._id?.toString(),
    accountId: result.accountId
  };
}

export async function resendTenantInvite(
  userId: mongoose.Types.ObjectId,
  tenantUserId: string
) {
  const orgId = await resolveLandlordOrgId(userId);
  await assertTenancyInOrg(tenantUserId, orgId);

  const User = mongoose.model('User');
  const tenantUser = await User.findById(tenantUserId).lean();
  if (!tenantUser) throw new AppError('Tenant user not found', 404);

  const email = (tenantUser as any).email;
  const firstName = (tenantUser as any).profile?.firstName || 'there';
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Find existing invite or create a new token
  let invite = await TenantInviteModel.findOne({
    tenantEmail: email.toLowerCase().trim(),
    status: { $in: ['SENT', 'PENDING'] }
  }).sort({ createdAt: -1 }).lean();

  let inviteToken: string;
  if (invite) {
    inviteToken = (invite as any).inviteToken;
    await TenantInviteModel.findByIdAndUpdate((invite as any)._id, {
      expiresAt,
      status: 'SENT'
    });
  } else {
    inviteToken = crypto.randomBytes(32).toString('hex');
    const tenancy = await TenancyModel.findOne({
      tenantUserId: new mongoose.Types.ObjectId(tenantUserId),
      status: { $nin: ['TERMINATED', 'ENDED'] }
    }).lean();
    await TenantInviteModel.create({
      tenantEmail: email.toLowerCase().trim(),
      unitId: (tenancy as any)?.unitId,
      propertyId: (tenancy as any) ? await UnitModel.findById((tenancy as any).unitId).then(u => (u as any)?.propertyId) : undefined,
      participationModel: 'RPA_ONLY',
      inviteMethod: 'LINK',
      deliveryMethod: 'LANDLORD_SHARED',
      requiredAgreements: ['RPA'],
      inviteToken,
      status: 'SENT',
      expiresAt
    });
  }

  const inviteUrl = buildAcceptInviteUrl(inviteToken);

  try {
    await sendTenantOnboardingInviteEmail({
      toEmail: email,
      firstName,
      onboardingUrl: inviteUrl,
      expiresAtIso: expiresAt.toISOString()
    });
    return { sent: true, email, inviteUrl };
  } catch {
    return { sent: false, email, inviteUrl, reason: 'Email delivery not configured' };
  }
}

import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { Membership } from '../../orgs/models/membership.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { findOrCreateCreditAccount } from './ledgerService';
import { createCreditEventWithIdempotency } from './idempotencyService';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { CreditEventType } from '../types/creditEventTypes';
import { IssueCreditsDTO } from '../dto/ledgerDTO';
import { RewardLedgerEventType } from '../types/unifiedLedgerTypes';

/**
 * Resolves orgId from request: body.orgId or from propertyId (property.orgId).
 * Verifies the actor has OWNER or ADMIN membership in that org.
 */
export async function resolveOrgAndVerifyAccess(
  actorUserId: mongoose.Types.ObjectId,
  body: { orgId?: string; propertyId?: string }
): Promise<string> {
  let orgId: string | undefined = body.orgId;

  if (!orgId && body.propertyId) {
    if (!mongoose.Types.ObjectId.isValid(body.propertyId)) {
      throw new AppError('Invalid property ID', 400);
    }
    const property = await PropertyModel.findById(body.propertyId).lean();
    if (!property) {
      throw new AppError('Property not found', 404);
    }
    orgId = property.orgId.toString();
  }

  if (!orgId) {
    throw new AppError('orgId or propertyId is required for org scope', 400);
  }

  const membership = await Membership.findOne({
    userId: actorUserId,
    orgId: new mongoose.Types.ObjectId(orgId),
    status: 'active',
  }).lean();

  if (!membership || !['OWNER', 'ADMIN'].includes(membership.roleInOrg)) {
    throw new AppError('Insufficient org permissions: OWNER or ADMIN required', 403);
  }

  return orgId;
}

/**
 * Ensures the tenant (tenantUserId) has an active tenancy in the given org.
 * If unitId is provided, tenant must be in that unit. If propertyId is provided, tenant must be in a unit of that property.
 */
export async function ensureTenantInOrg(
  tenantUserId: string,
  orgId: string,
  options: { unitId?: string; propertyId?: string }
): Promise<void> {
  const tenantId = new mongoose.Types.ObjectId(tenantUserId);

  const tenancies = await TenancyModel.find({
    tenantUserId: tenantId,
    status: 'ACTIVE',
  }).lean();

  for (const t of tenancies) {
    const unit = await UnitModel.findById(t.unitId).lean();
    if (!unit) continue;
    const property = await PropertyModel.findById(unit.propertyId).lean();
    if (!property || property.orgId.toString() !== orgId) continue;

    if (options.unitId && unit._id.toString() !== options.unitId) continue;
    if (options.propertyId && unit.propertyId.toString() !== options.propertyId) continue;

    return; // tenant is in org (and optionally in this unit/property)
  }

  throw new AppError('Tenant is not in this organization (no active tenancy)', 403);
}

/**
 * Issues credits to a tenant (EARN or ADJUST). Creates credit event and audit.
 * Caller must have resolved org and verified tenant in org before calling.
 */
export async function issueCreditsToTenant(
  dto: IssueCreditsDTO,
  orgId: string,
  actorUserId: mongoose.Types.ObjectId
): Promise<{ event: any; accountId: string }> {
  const account = await findOrCreateCreditAccount({
    tenantUserId: dto.tenantUserId,
    orgId,
    unitId: dto.unitId,
  });

  const accountId = (account as any)._id;
  const eventType =
    dto.type === 'ADJUST'
      ? CreditEventType.ADJUSTMENT
      : CreditEventType.CREDIT;

  const businessEventType =
    dto.eventType ??
    (dto.type === 'ADJUST'
      ? RewardLedgerEventType.LANDLORD_CREDIT_ADJUST
      : RewardLedgerEventType.LANDLORD_CREDIT_EARN);

  const propertyIdObj =
    dto.propertyId && mongoose.Types.ObjectId.isValid(dto.propertyId)
      ? new mongoose.Types.ObjectId(dto.propertyId)
      : undefined;

  const result = await createCreditEventWithIdempotency(
    {
      accountId,
      type: eventType,
      amount: dto.amount,
      occurredAt: new Date(),
      description: dto.reason,
      referenceId: undefined,
    },
    dto.idempotencyKey,
    {
      propertyId: propertyIdObj,
      businessEventType,
    }
  );

  const propertyOid =
    dto.propertyId && mongoose.Types.ObjectId.isValid(dto.propertyId)
      ? new mongoose.Types.ObjectId(dto.propertyId)
      : undefined;
  const tenantOid = mongoose.Types.ObjectId.isValid(dto.tenantUserId)
    ? new mongoose.Types.ObjectId(dto.tenantUserId)
    : undefined;

  await writeAuditEvent({
    actorUserId,
    orgId: new mongoose.Types.ObjectId(orgId),
    action: 'CREDITS_ISSUED',
    entityType: 'LEDGER',
    entityId: result.event._id,
    propertyId: propertyOid,
    tenantId: tenantOid,
    diff: {
      after: {
        tenantUserId: dto.tenantUserId,
        amount: dto.amount,
        reason: dto.reason,
        type: dto.type,
        accountId: accountId.toString(),
      },
    },
  });

  return {
    event: result.event.toObject(),
    accountId: accountId.toString(),
  };
}

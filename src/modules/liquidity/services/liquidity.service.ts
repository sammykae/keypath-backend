import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import {
  LiquidityRequestModel,
  ILiquidityRequest,
  LiquidityStatus,
  RofrDecision,
  TransferStatus,
  CANCELLABLE_STATUSES,
  DEFAULT_ROFR_RESPONSE_DAYS,
} from '../models/liquidityRequest.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TokenLedgerEntryModel, TokenLedgerEntryType } from '../../ledger/models/tokenLedgerEntry.model';
import { getVestingSummary } from '../../ledger/services/vesting.service';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';

/** Pure — vested token payment right after deductions. Never goes negative. */
export function computeVestedTokenPaymentRight(
  requestedTokens: number,
  deductions: { amountTokens: number }[]
): number {
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amountTokens, 0);
  return Math.max(0, requestedTokens - totalDeductions);
}

function toDTO(r: any) {
  return {
    id: r._id.toString(),
    tenantUserId: r.tenantUserId.toString(),
    tenancyId: r.tenancyId.toString(),
    propertyId: r.propertyId.toString(),
    requestedTokens: r.requestedTokens,
    vestedTokensAtRequest: r.vestedTokensAtRequest,
    status: r.status,
    statusHistory: r.statusHistory.map((h: any) => ({
      status: h.status, changedBy: h.changedBy.toString(), changedAt: new Date(h.changedAt).toISOString(), note: h.note ?? null,
    })),
    deductions: r.deductions.map((d: any) => ({
      id: d._id.toString(), amountTokens: d.amountTokens, reason: d.reason,
      approvedBy: d.approvedBy.toString(), approvedAt: new Date(d.approvedAt).toISOString(),
    })),
    vestedTokenPaymentRight: computeVestedTokenPaymentRight(r.requestedTokens, r.deductions),
    rofrDecision: r.rofrDecision,
    rofrResponseDeadline: r.rofrResponseDeadline ? new Date(r.rofrResponseDeadline).toISOString() : null,
    rofrNote: r.rofrNote ?? null,
    transferStatus: r.transferStatus,
    transferCompletedAt: r.transferCompletedAt ? new Date(r.transferCompletedAt).toISOString() : null,
    transferNote: r.transferNote ?? null,
    submittedAt: new Date(r.submittedAt).toISOString(),
    reviewNote: r.reviewNote ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

function pushHistory(req: ILiquidityRequest, status: LiquidityStatus, changedBy: mongoose.Types.ObjectId, note?: string) {
  req.status = status;
  req.statusHistory.push({ status, changedBy, changedAt: new Date(), note } as any);
}

/** Tenant submits a liquidity request against their currently vested tokens. */
export async function submitLiquidityRequest(
  tenantUserId: mongoose.Types.ObjectId,
  input: { tokens: number }
) {
  if (input.tokens <= 0) throw new AppError('tokens must be greater than 0', 400);

  const vesting = await getVestingSummary(tenantUserId);
  if (input.tokens > vesting.vestedTokens) {
    throw new AppError(
      `Requested tokens (${input.tokens}) exceed vested balance (${vesting.vestedTokens})`,
      400
    );
  }

  const tenancy = await TenancyModel.findOne({
    tenantUserId,
    status: { $in: ['ACTIVE', 'PENDING'] },
  }).sort({ updatedAt: -1 }).lean();
  if (!tenancy) throw new AppError('No active tenancy found', 404);

  const unit = await UnitModel.findById((tenancy as any).unitId).lean();
  if (!unit) throw new AppError('Unit not found', 404);
  const property = await PropertyModel.findById((unit as any).propertyId).lean();
  if (!property) throw new AppError('Property not found', 404);

  const doc = await LiquidityRequestModel.create({
    orgId: (property as any).orgId,
    tenantUserId,
    tenancyId: (tenancy as any)._id,
    propertyId: (property as any)._id,
    requestedTokens: input.tokens,
    vestedTokensAtRequest: vesting.vestedTokens,
    status: 'SUBMITTED',
    statusHistory: [{ status: 'SUBMITTED', changedBy: tenantUserId, changedAt: new Date() }],
  });

  AuditEvent.create({
    actorUserId: tenantUserId,
    orgId: (property as any).orgId,
    action: 'LIQUIDITY_REQUEST_SUBMITTED',
    entityType: 'liquidityRequest',
    entityId: doc._id,
    source: 'user',
    updateType: 'manual',
    propertyId: (property as any)._id,
    tenantId: tenantUserId,
    metadata: { requestedTokens: input.tokens },
    diff: { before: null, after: { status: 'SUBMITTED', requestedTokens: input.tokens } },
  }).catch(() => {});

  return toDTO(doc);
}

async function findOrgRequest(landlordUserId: mongoose.Types.ObjectId, requestId: string) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) throw new AppError('Invalid request id', 400);
  const orgId = await resolveLandlordOrgId(landlordUserId);
  const request = await LiquidityRequestModel.findOne({
    _id: new mongoose.Types.ObjectId(requestId),
    orgId: new mongoose.Types.ObjectId(orgId),
  });
  if (!request) throw new AppError('Liquidity request not found', 404);
  return request;
}

/** Landlord/admin: move status forward (UNDER_REVIEW / APPROVED / DENIED). */
export async function reviewLiquidityRequest(
  landlordUserId: mongoose.Types.ObjectId,
  requestId: string,
  input: { status: 'UNDER_REVIEW' | 'APPROVED' | 'DENIED'; note?: string }
) {
  const request = await findOrgRequest(landlordUserId, requestId);
  if (request.status === 'COMPLETED' || request.status === 'CANCELLED' || request.status === 'DENIED') {
    throw new AppError(`Cannot review a request in status ${request.status}`, 400);
  }

  const before = request.status;
  pushHistory(request, input.status, landlordUserId, input.note);
  request.reviewedBy = landlordUserId;
  request.reviewedAt = new Date();
  request.reviewNote = input.note ?? request.reviewNote;

  if (input.status === 'APPROVED') {
    request.rofrDecision = 'PENDING';
    request.rofrResponseDeadline = new Date(Date.now() + DEFAULT_ROFR_RESPONSE_DAYS * 24 * 60 * 60 * 1000);
  }

  await request.save();

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: request.orgId,
    action: 'LIQUIDITY_REQUEST_REVIEWED',
    entityType: 'liquidityRequest',
    entityId: request._id,
    source: 'user',
    updateType: 'manual',
    propertyId: request.propertyId,
    tenantId: request.tenantUserId,
    metadata: { note: input.note },
    diff: { before: { status: before }, after: { status: input.status } },
  }).catch(() => {});

  return toDTO(request);
}

/** Landlord/admin: record an approved deduction against the request (before transfer completes). */
export async function addDeduction(
  landlordUserId: mongoose.Types.ObjectId,
  requestId: string,
  input: { amountTokens: number; reason: string }
) {
  if (input.amountTokens <= 0) throw new AppError('amountTokens must be greater than 0', 400);
  const request = await findOrgRequest(landlordUserId, requestId);
  if (request.status !== 'APPROVED') {
    throw new AppError('Deductions can only be added to an APPROVED request', 400);
  }
  if (request.transferStatus === 'COMPLETED') {
    throw new AppError('Cannot modify a completed transfer', 400);
  }

  const currentRight = computeVestedTokenPaymentRight(request.requestedTokens, request.deductions);
  if (input.amountTokens > currentRight) {
    throw new AppError(`Deduction (${input.amountTokens}) exceeds remaining payment right (${currentRight})`, 400);
  }

  request.deductions.push({
    amountTokens: input.amountTokens,
    reason: input.reason,
    approvedBy: landlordUserId,
    approvedAt: new Date(),
  } as any);
  await request.save();

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: request.orgId,
    action: 'LIQUIDITY_DEDUCTION_ADDED',
    entityType: 'liquidityRequest',
    entityId: request._id,
    source: 'user',
    updateType: 'manual',
    propertyId: request.propertyId,
    tenantId: request.tenantUserId,
    metadata: { amountTokens: input.amountTokens, reason: input.reason },
    diff: { before: null, after: { amountTokens: input.amountTokens, reason: input.reason } },
  }).catch(() => {});

  return toDTO(request);
}

/** Landlord/admin: record the ROFR decision on an APPROVED request. */
export async function setRofrDecision(
  landlordUserId: mongoose.Types.ObjectId,
  requestId: string,
  input: { decision: Exclude<RofrDecision, 'PENDING'>; note?: string }
) {
  const request = await findOrgRequest(landlordUserId, requestId);
  if (request.status !== 'APPROVED') {
    throw new AppError('ROFR can only be decided on an APPROVED request', 400);
  }

  const before = request.rofrDecision;
  request.rofrDecision = input.decision;
  request.rofrDecidedBy = landlordUserId;
  request.rofrDecidedAt = new Date();
  request.rofrNote = input.note ?? null;
  await request.save();

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: request.orgId,
    action: 'LIQUIDITY_ROFR_DECIDED',
    entityType: 'liquidityRequest',
    entityId: request._id,
    source: 'user',
    updateType: 'manual',
    propertyId: request.propertyId,
    tenantId: request.tenantUserId,
    diff: { before: { rofrDecision: before }, after: { rofrDecision: input.decision } },
  }).catch(() => {});

  return toDTO(request);
}

/**
 * Landlord/admin: update the off-platform transfer status. Completing the
 * transfer finalizes the request and writes the ledger entries that move
 * tokens out of the tenant's balance (deductions + net payout).
 */
export async function setTransferStatus(
  landlordUserId: mongoose.Types.ObjectId,
  requestId: string,
  input: { status: Exclude<TransferStatus, 'NOT_STARTED'>; note?: string }
) {
  const request = await findOrgRequest(landlordUserId, requestId);
  if (request.status !== 'APPROVED') {
    throw new AppError('Transfer can only proceed on an APPROVED request', 400);
  }
  if (request.rofrDecision === 'PENDING') {
    throw new AppError('ROFR decision is still pending — cannot start transfer', 400);
  }

  request.transferStatus = input.status;
  request.transferNote = input.note ?? request.transferNote;

  if (input.status === 'COMPLETED') {
    if (request.transferCompletedAt) {
      throw new AppError('Transfer already completed', 409);
    }
    request.transferCompletedAt = new Date();
    pushHistory(request, 'COMPLETED', landlordUserId, input.note);

    const netPayout = computeVestedTokenPaymentRight(request.requestedTokens, request.deductions);

    for (const d of request.deductions) {
      await TokenLedgerEntryModel.create({
        tenantId: request.tenantUserId,
        propertyId: request.propertyId,
        type: TokenLedgerEntryType.APPROVED_DEDUCTION,
        tokens: -d.amountTokens,
        timestamp: new Date(),
        source: `LIQUIDITY:${request._id.toString()}:DEDUCTION:${d._id.toString()}`,
      }).catch(() => {}); // idempotent-ish: unique fingerprint index guards re-runs
    }

    if (netPayout > 0) {
      await TokenLedgerEntryModel.create({
        tenantId: request.tenantUserId,
        propertyId: request.propertyId,
        type: TokenLedgerEntryType.TRANSFER_REQUEST,
        tokens: -netPayout,
        timestamp: new Date(),
        source: `LIQUIDITY:${request._id.toString()}:TRANSFER`,
      }).catch(() => {});

      // Informational label matching the "Vested Token Payment Right" ledger
      // event type — the TRANSFER_REQUEST entry above is what actually moves
      // the tenant's balance; this records the right that was exercised.
      await TokenLedgerEntryModel.create({
        tenantId: request.tenantUserId,
        propertyId: request.propertyId,
        type: TokenLedgerEntryType.VESTED_TOKEN_PAYMENT_RIGHT,
        tokens: 0,
        value: netPayout,
        timestamp: new Date(),
        source: `LIQUIDITY:${request._id.toString()}:PAYMENT_RIGHT`,
      }).catch(() => {});
    }
  }

  await request.save();

  AuditEvent.create({
    actorUserId: landlordUserId,
    orgId: request.orgId,
    action: 'LIQUIDITY_TRANSFER_STATUS_CHANGED',
    entityType: 'liquidityRequest',
    entityId: request._id,
    source: 'user',
    updateType: 'manual',
    propertyId: request.propertyId,
    tenantId: request.tenantUserId,
    metadata: { transferStatus: input.status },
  }).catch(() => {});

  return toDTO(request);
}

/** Tenant cancels their own request while it is still SUBMITTED/UNDER_REVIEW. */
export async function cancelLiquidityRequest(
  tenantUserId: mongoose.Types.ObjectId,
  requestId: string
) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) throw new AppError('Invalid request id', 400);
  const request = await LiquidityRequestModel.findOne({
    _id: new mongoose.Types.ObjectId(requestId),
    tenantUserId,
  });
  if (!request) throw new AppError('Liquidity request not found', 404);
  if (!CANCELLABLE_STATUSES.includes(request.status)) {
    throw new AppError(`Cannot cancel a request in status ${request.status}`, 400);
  }

  const before = request.status;
  pushHistory(request, 'CANCELLED', tenantUserId);
  await request.save();

  AuditEvent.create({
    actorUserId: tenantUserId,
    orgId: request.orgId,
    action: 'LIQUIDITY_REQUEST_CANCELLED',
    entityType: 'liquidityRequest',
    entityId: request._id,
    source: 'user',
    updateType: 'manual',
    propertyId: request.propertyId,
    tenantId: tenantUserId,
    diff: { before: { status: before }, after: { status: 'CANCELLED' } },
  }).catch(() => {});

  return toDTO(request);
}

export async function getMyLiquidityRequests(tenantUserId: mongoose.Types.ObjectId) {
  const rows = await LiquidityRequestModel.find({ tenantUserId }).sort({ createdAt: -1 }).lean();
  return rows.map(toDTO);
}

export async function listLiquidityRequestsForOrg(
  landlordUserId: mongoose.Types.ObjectId,
  filter: { status?: LiquidityStatus } = {}
) {
  const orgId = await resolveLandlordOrgId(landlordUserId);
  const query: any = { orgId: new mongoose.Types.ObjectId(orgId) };
  if (filter.status) query.status = filter.status;
  const rows = await LiquidityRequestModel.find(query).sort({ createdAt: -1 }).lean();
  return rows.map(toDTO);
}

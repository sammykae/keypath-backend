import mongoose from 'mongoose';
import {
  computeVestedTokenPaymentRight,
  submitLiquidityRequest,
  reviewLiquidityRequest,
  addDeduction,
  setRofrDecision,
  setTransferStatus,
  cancelLiquidityRequest,
} from './liquidity.service';
import { LiquidityRequestModel } from '../models/liquidityRequest.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TokenLedgerEntryModel } from '../../ledger/models/tokenLedgerEntry.model';
import { getVestingSummary } from '../../ledger/services/vesting.service';

const ORG_A = '507f1f77bcf86cd7994390aa';
const TENANT_A = '507f1f77bcf86cd799439001';
const LANDLORD_A = '507f1f77bcf86cd799439002';
const PROPERTY_A = '507f1f77bcf86cd799439011';
const TENANCY_A = '507f1f77bcf86cd799439012';

jest.mock('../../landlord/services/landlordDashboard.service', () => ({
  resolveLandlordOrgId: jest.fn().mockResolvedValue('507f1f77bcf86cd7994390aa'),
}));

jest.mock('../../audit/models/audit-log.model', () => ({
  AuditEvent: { create: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../../ledger/services/vesting.service', () => ({
  getVestingSummary: jest.fn(),
}));

jest.mock('../models/liquidityRequest.model', () => {
  const actual = jest.requireActual('../models/liquidityRequest.model');
  return {
    ...actual,
    LiquidityRequestModel: { create: jest.fn(), findOne: jest.fn() },
  };
});

jest.mock('../../tenancies/models/tenancyModel', () => ({
  TenancyModel: { findOne: jest.fn() },
}));

jest.mock('../../units/models/unit.model', () => ({
  UnitModel: { findById: jest.fn() },
}));

jest.mock('../../properties/models/propertyModel', () => ({
  PropertyModel: { findById: jest.fn() },
}));

jest.mock('../../ledger/models/tokenLedgerEntry.model', () => ({
  TokenLedgerEntryModel: { create: jest.fn().mockResolvedValue(null) },
  TokenLedgerEntryType: jest.requireActual('../../ledger/models/tokenLedgerEntry.model').TokenLedgerEntryType,
}));

function leanChain<T>(value: T) {
  return { sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }), lean: jest.fn().mockResolvedValue(value) };
}

describe('computeVestedTokenPaymentRight (pure)', () => {
  it('returns full amount with no deductions', () => {
    expect(computeVestedTokenPaymentRight(100, [])).toBe(100);
  });

  it('subtracts total deductions', () => {
    expect(computeVestedTokenPaymentRight(100, [{ amountTokens: 20 }, { amountTokens: 10 }])).toBe(70);
  });

  it('never goes negative', () => {
    expect(computeVestedTokenPaymentRight(50, [{ amountTokens: 80 }])).toBe(0);
  });
});

/** Minimal mutable mock document mimicking a Mongoose subdoc with .save()/.deleteOne(). */
function makeRequestDoc(overrides: Record<string, any> = {}) {
  const doc: any = {
    _id: new mongoose.Types.ObjectId(),
    orgId: new mongoose.Types.ObjectId(ORG_A),
    tenantUserId: new mongoose.Types.ObjectId(TENANT_A),
    tenancyId: new mongoose.Types.ObjectId(TENANCY_A),
    propertyId: new mongoose.Types.ObjectId(PROPERTY_A),
    requestedTokens: 100,
    vestedTokensAtRequest: 150,
    status: 'SUBMITTED',
    statusHistory: [],
    deductions: [],
    rofrDecision: 'PENDING',
    rofrResponseDeadline: null,
    transferStatus: 'NOT_STARTED',
    transferCompletedAt: null,
    submittedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  doc.deductions = (doc.deductions ?? []).map((d: any) => ({
    _id: d._id ?? new mongoose.Types.ObjectId(),
    approvedBy: d.approvedBy ?? new mongoose.Types.ObjectId(LANDLORD_A),
    approvedAt: d.approvedAt ?? new Date(),
    ...d,
  }));
  doc.save = jest.fn().mockResolvedValue(doc);
  doc.deleteOne = jest.fn().mockResolvedValue(null);
  return doc;
}

describe('liquidity.service — submitLiquidityRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when requested tokens exceed vested balance', async () => {
    (getVestingSummary as jest.Mock).mockResolvedValue({ vestedTokens: 50 });

    await expect(
      submitLiquidityRequest(new mongoose.Types.ObjectId(TENANT_A), { tokens: 100 })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(LiquidityRequestModel.create).not.toHaveBeenCalled();
  });

  it('rejects zero/negative token requests', async () => {
    await expect(
      submitLiquidityRequest(new mongoose.Types.ObjectId(TENANT_A), { tokens: 0 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates a SUBMITTED request scoped to the tenant org when within vested balance', async () => {
    (getVestingSummary as jest.Mock).mockResolvedValue({ vestedTokens: 200 });
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: TENANCY_A, unitId: 'u1' }));
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ propertyId: PROPERTY_A }));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: new mongoose.Types.ObjectId(ORG_A) }));
    (LiquidityRequestModel.create as jest.Mock).mockResolvedValue(makeRequestDoc({ requestedTokens: 100 }));

    const result = await submitLiquidityRequest(new mongoose.Types.ObjectId(TENANT_A), { tokens: 100 });

    expect(result.status).toBe('SUBMITTED');
    expect(result.requestedTokens).toBe(100);
    const created = (LiquidityRequestModel.create as jest.Mock).mock.calls[0][0];
    expect(created.orgId.toString()).toBe(ORG_A);
  });
});

describe('liquidity.service — state machine guards (org-scoped)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reviewLiquidityRequest rejects a terminal-status request', async () => {
    (LiquidityRequestModel.findOne as jest.Mock).mockResolvedValue(makeRequestDoc({ status: 'COMPLETED' }));

    await expect(
      reviewLiquidityRequest(new mongoose.Types.ObjectId(LANDLORD_A), 'x'.repeat(24), { status: 'APPROVED' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('reviewLiquidityRequest is org-scoped (query includes orgId)', async () => {
    (LiquidityRequestModel.findOne as jest.Mock).mockResolvedValue(makeRequestDoc({ status: 'SUBMITTED' }));

    await reviewLiquidityRequest(new mongoose.Types.ObjectId(LANDLORD_A), 'a'.repeat(24), { status: 'APPROVED' });

    const filter = (LiquidityRequestModel.findOne as jest.Mock).mock.calls[0][0];
    expect(filter.orgId.toString()).toBe(ORG_A);
  });

  it('approving sets rofrDecision to PENDING with a response deadline', async () => {
    const doc = makeRequestDoc({ status: 'SUBMITTED' });
    (LiquidityRequestModel.findOne as jest.Mock).mockResolvedValue(doc);

    const result = await reviewLiquidityRequest(new mongoose.Types.ObjectId(LANDLORD_A), 'a'.repeat(24), { status: 'APPROVED' });

    expect(result.status).toBe('APPROVED');
    expect(result.rofrDecision).toBe('PENDING');
    expect(result.rofrResponseDeadline).not.toBeNull();
  });

  it('addDeduction rejects on a non-APPROVED request', async () => {
    (LiquidityRequestModel.findOne as jest.Mock).mockResolvedValue(makeRequestDoc({ status: 'SUBMITTED' }));

    await expect(
      addDeduction(new mongoose.Types.ObjectId(LANDLORD_A), 'a'.repeat(24), { amountTokens: 10, reason: 'damage' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('addDeduction rejects an amount exceeding the remaining payment right', async () => {
    (LiquidityRequestModel.findOne as jest.Mock).mockResolvedValue(
      makeRequestDoc({ status: 'APPROVED', requestedTokens: 100, deductions: [{ amountTokens: 90 }] })
    );

    await expect(
      addDeduction(new mongoose.Types.ObjectId(LANDLORD_A), 'a'.repeat(24), { amountTokens: 20, reason: 'more damage' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('setRofrDecision rejects on a non-APPROVED request', async () => {
    (LiquidityRequestModel.findOne as jest.Mock).mockResolvedValue(makeRequestDoc({ status: 'SUBMITTED' }));

    await expect(
      setRofrDecision(new mongoose.Types.ObjectId(LANDLORD_A), 'a'.repeat(24), { decision: 'WAIVED' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('setTransferStatus rejects when ROFR decision is still PENDING', async () => {
    (LiquidityRequestModel.findOne as jest.Mock).mockResolvedValue(
      makeRequestDoc({ status: 'APPROVED', rofrDecision: 'PENDING' })
    );

    await expect(
      setTransferStatus(new mongoose.Types.ObjectId(LANDLORD_A), 'a'.repeat(24), { status: 'PENDING' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('setTransferStatus COMPLETED writes deduction + net payout ledger entries and finalizes the request', async () => {
    const doc = makeRequestDoc({
      status: 'APPROVED',
      rofrDecision: 'WAIVED',
      requestedTokens: 100,
      deductions: [{ _id: new mongoose.Types.ObjectId(), amountTokens: 20 }],
    });
    (LiquidityRequestModel.findOne as jest.Mock).mockResolvedValue(doc);

    const result = await setTransferStatus(new mongoose.Types.ObjectId(LANDLORD_A), 'a'.repeat(24), { status: 'COMPLETED' });

    expect(result.status).toBe('COMPLETED');
    expect(result.transferStatus).toBe('COMPLETED');
    // 1 deduction entry + 1 net-payout entry + 1 informational payment-right entry (100 - 20 = 80)
    expect(TokenLedgerEntryModel.create).toHaveBeenCalledTimes(3);
    const calls = (TokenLedgerEntryModel.create as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.type === 'approved_deduction')?.tokens).toBe(-20);
    expect(calls.find((c) => c.type === 'transfer_request')?.tokens).toBe(-80);
    const paymentRight = calls.find((c) => c.type === 'vested_token_payment_right');
    expect(paymentRight?.tokens).toBe(0);
    expect(paymentRight?.value).toBe(80);
  });

  it('setTransferStatus rejects completing an already-completed transfer', async () => {
    (LiquidityRequestModel.findOne as jest.Mock).mockResolvedValue(
      makeRequestDoc({ status: 'APPROVED', rofrDecision: 'WAIVED', transferCompletedAt: new Date() })
    );

    await expect(
      setTransferStatus(new mongoose.Types.ObjectId(LANDLORD_A), 'a'.repeat(24), { status: 'COMPLETED' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('cancelLiquidityRequest rejects a non-cancellable status', async () => {
    (LiquidityRequestModel.findOne as jest.Mock).mockResolvedValue(makeRequestDoc({ status: 'APPROVED' }));

    await expect(
      cancelLiquidityRequest(new mongoose.Types.ObjectId(TENANT_A), 'a'.repeat(24))
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('cancelLiquidityRequest is scoped to the requesting tenant', async () => {
    (LiquidityRequestModel.findOne as jest.Mock).mockResolvedValue(makeRequestDoc({ status: 'SUBMITTED' }));

    await cancelLiquidityRequest(new mongoose.Types.ObjectId(TENANT_A), 'a'.repeat(24));

    const filter = (LiquidityRequestModel.findOne as jest.Mock).mock.calls[0][0];
    expect(filter.tenantUserId.toString()).toBe(TENANT_A);
  });
});

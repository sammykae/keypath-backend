import mongoose from 'mongoose';
import {
  markTenantEligible,
  submitVerification,
  startVerificationReview,
  reviewVerification,
  disputeVerification,
  resolveDispute,
} from './rewardVerification.service';
import { RewardVerificationModel } from '../models/rewardVerification.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { issueCreditsToTenant } from '../../ledger/services/issueCredits.service';
import { Membership } from '../../orgs/models/membership.model';
import { notify } from '../../notifications/services/notification.service';
import { AuditEvent } from '../../audit/models/audit-log.model';

const ORG_ID = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();
const LANDLORD_1 = new mongoose.Types.ObjectId();

jest.mock('../models/rewardVerification.model', () => ({
  RewardVerificationModel: { create: jest.fn(), findOne: jest.fn(), find: jest.fn() },
}));
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { exists: jest.fn(), findById: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../audit/models/audit-log.model', () => ({ AuditEvent: { create: jest.fn().mockResolvedValue(null) } }));
jest.mock('../../ledger/services/issueCredits.service', () => ({ issueCreditsToTenant: jest.fn() }));
jest.mock('../../orgs/models/membership.model', () => ({ Membership: { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) } }));
jest.mock('../../notifications/services/notification.service', () => ({ notify: jest.fn() }));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function makeDoc(overrides: Record<string, any> = {}) {
  const doc: any = {
    _id: new mongoose.Types.ObjectId(),
    orgId: ORG_ID,
    propertyId: PROPERTY_A,
    unitId: null,
    tenantUserId: TENANT_1,
    campaignId: null,
    eligibleBehavior: 'ON_TIME_RENT',
    rewardType: 'POINTS',
    status: 'SUBMITTED',
    proofNote: null,
    attachments: [],
    creditsRequested: null,
    creditsAwarded: 0,
    denialReason: null,
    disputeReason: null,
    resolutionOutcome: null,
    resolutionNote: null,
    submittedAt: null,
    reviewedAt: null,
    disputedAt: null,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  doc.save = jest.fn().mockImplementation(async () => doc);
  return doc;
}

describe('markTenantEligible', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the property is not in the org', async () => {
    (PropertyModel.exists as jest.Mock).mockResolvedValue(null);
    await expect(
      markTenantEligible(LANDLORD_1, ORG_ID.toString(), {
        propertyId: PROPERTY_A.toString(),
        tenantUserId: TENANT_1.toString(),
        eligibleBehavior: 'ON_TIME_RENT',
        rewardType: 'POINTS',
      } as any)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('creates an ELIGIBLE record when the property is in the org', async () => {
    (PropertyModel.exists as jest.Mock).mockResolvedValue(true);
    (RewardVerificationModel.create as jest.Mock).mockResolvedValue(makeDoc({ status: 'ELIGIBLE' }));

    const result = await markTenantEligible(LANDLORD_1, ORG_ID.toString(), {
      propertyId: PROPERTY_A.toString(),
      tenantUserId: TENANT_1.toString(),
      eligibleBehavior: 'ON_TIME_RENT',
      rewardType: 'POINTS',
    } as any);

    expect(result.status).toBe('ELIGIBLE');
  });
});

describe('submitVerification', () => {
  beforeEach(() => jest.clearAllMocks());

  const VALID_INPUT = {
    propertyId: PROPERTY_A.toString(),
    eligibleBehavior: 'ON_TIME_RENT' as const,
    rewardType: 'POINTS' as const,
    attachments: [],
  };

  it('rejects when the tenant has no active tenancy at the property', async () => {
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID }));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([]));

    await expect(submitVerification(TENANT_1, VALID_INPUT as any)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('creates a new SUBMITTED record when no ELIGIBLE row exists', async () => {
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID }));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([{ unitId: UNIT_1 }]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A }]));
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(null);
    (RewardVerificationModel.create as jest.Mock).mockResolvedValue(makeDoc({ status: 'SUBMITTED' }));
    (Membership.findOne as jest.Mock).mockReturnValue(leanChain({ userId: LANDLORD_1 }));

    const result = await submitVerification(TENANT_1, VALID_INPUT as any);

    expect(result.status).toBe('SUBMITTED');
    expect(RewardVerificationModel.create).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'REWARD_SUBMITTED', recipientId: LANDLORD_1 }));
  });

  it('transitions an existing ELIGIBLE row to SUBMITTED instead of creating a duplicate', async () => {
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID }));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([{ unitId: UNIT_1 }]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A }]));
    const existing = makeDoc({ status: 'ELIGIBLE' });
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(existing);

    const result = await submitVerification(TENANT_1, VALID_INPUT as any);

    expect(RewardVerificationModel.create).not.toHaveBeenCalled();
    expect(existing.status).toBe('SUBMITTED');
    expect(result.status).toBe('SUBMITTED');
  });
});

describe('startVerificationReview', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects from a non-SUBMITTED status', async () => {
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(makeDoc({ status: 'ISSUED' }));
    await expect(
      startVerificationReview(LANDLORD_1, ORG_ID.toString(), new mongoose.Types.ObjectId().toString())
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('moves SUBMITTED to PENDING_VERIFICATION', async () => {
    const doc = makeDoc({ status: 'SUBMITTED' });
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(doc);

    const result = await startVerificationReview(LANDLORD_1, ORG_ID.toString(), doc._id.toString());

    expect(result.status).toBe('PENDING_VERIFICATION');
  });
});

describe('reviewVerification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('denying sets DENIED with the reason and does not touch the ledger', async () => {
    const doc = makeDoc({ status: 'PENDING_VERIFICATION' });
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(doc);

    const result = await reviewVerification(LANDLORD_1, ORG_ID.toString(), doc._id.toString(), {
      action: 'DENY',
      denialReason: 'Not enough proof',
    });

    expect(result.status).toBe('DENIED');
    expect(result.denialReason).toBe('Not enough proof');
    expect(issueCreditsToTenant).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'REWARD_DENIED', recipientId: doc.tenantUserId }));
    expect(AuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REWARD_VERIFICATION_DENIED',
        diff: { before: { status: 'PENDING_VERIFICATION' }, after: { status: 'DENIED', denialReason: 'Not enough proof' } },
      })
    );
  });

  it('approving issues credits via the ledger and moves straight to ISSUED', async () => {
    const doc = makeDoc({ status: 'PENDING_VERIFICATION' });
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(doc);
    (issueCreditsToTenant as jest.Mock).mockResolvedValue({ event: {}, accountId: 'acc1' });

    const result = await reviewVerification(LANDLORD_1, ORG_ID.toString(), doc._id.toString(), {
      action: 'APPROVE',
      creditsAwarded: 50,
    });

    expect(issueCreditsToTenant).toHaveBeenCalledWith(
      expect.objectContaining({ tenantUserId: TENANT_1.toString(), amount: 50, type: 'EARN' }),
      ORG_ID.toString(),
      LANDLORD_1
    );
    expect(result.status).toBe('ISSUED');
    expect(result.creditsAwarded).toBe(50);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'REWARD_APPROVED', recipientId: doc.tenantUserId }));
    expect(AuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REWARD_VERIFICATION_ISSUED',
        diff: { before: { status: 'PENDING_VERIFICATION' }, after: { status: 'ISSUED', creditsAwarded: 50 } },
      })
    );
  });

  it('rejects reviewing a verification that is not under review', async () => {
    const doc = makeDoc({ status: 'ISSUED' });
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(doc);

    await expect(
      reviewVerification(LANDLORD_1, ORG_ID.toString(), doc._id.toString(), { action: 'APPROVE' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('disputeVerification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects disputing a verification that is not DENIED', async () => {
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(makeDoc({ status: 'ISSUED' }));
    await expect(
      disputeVerification(TENANT_1, new mongoose.Types.ObjectId().toString(), { disputeReason: 'unfair' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('moves DENIED to DISPUTED with the reason', async () => {
    const doc = makeDoc({ status: 'DENIED' });
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(doc);

    const result = await disputeVerification(TENANT_1, doc._id.toString(), { disputeReason: 'I did submit proof' });

    expect(result.status).toBe('DISPUTED');
    expect(result.disputeReason).toBe('I did submit proof');
    expect(AuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REWARD_VERIFICATION_DISPUTED',
        diff: { before: { status: 'DENIED' }, after: { status: 'DISPUTED' } },
      })
    );
  });
});

describe('resolveDispute', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects resolving a verification that is not DISPUTED', async () => {
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(makeDoc({ status: 'DENIED' }));
    await expect(
      resolveDispute(LANDLORD_1, ORG_ID.toString(), new mongoose.Types.ObjectId().toString(), { outcome: 'UPHOLD' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('UPHOLD resolves without issuing credits', async () => {
    const doc = makeDoc({ status: 'DISPUTED' });
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(doc);

    const result = await resolveDispute(LANDLORD_1, ORG_ID.toString(), doc._id.toString(), { outcome: 'UPHOLD' });

    expect(result.status).toBe('RESOLVED');
    expect(result.resolutionOutcome).toBe('UPHELD');
    expect(issueCreditsToTenant).not.toHaveBeenCalled();
    expect(AuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REWARD_VERIFICATION_DISPUTE_RESOLVED',
        diff: { before: { status: 'DISPUTED' }, after: { status: 'RESOLVED', resolutionOutcome: 'UPHELD', creditsAwarded: 0 } },
      })
    );
  });

  it('OVERTURN issues credits and marks OVERTURNED', async () => {
    const doc = makeDoc({ status: 'DISPUTED' });
    (RewardVerificationModel.findOne as jest.Mock).mockResolvedValue(doc);
    (issueCreditsToTenant as jest.Mock).mockResolvedValue({ event: {}, accountId: 'acc1' });

    const result = await resolveDispute(LANDLORD_1, ORG_ID.toString(), doc._id.toString(), {
      outcome: 'OVERTURN',
      creditsAwarded: 30,
    });

    expect(issueCreditsToTenant).toHaveBeenCalled();
    expect(result.status).toBe('RESOLVED');
    expect(result.resolutionOutcome).toBe('OVERTURNED');
    expect(result.creditsAwarded).toBe(30);
  });
});

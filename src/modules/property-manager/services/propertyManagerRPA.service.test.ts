import mongoose from 'mongoose';
import {
  listRewardCatalogForPM,
  createRewardCatalogEntryForPM,
  listCampaignsForPM,
  createCampaignForPM,
  listChallengesForPM,
  createChallengeForPM,
  listPendingRedemptionsForPM,
  reviewRedemptionForPM,
  adjustTenantBalanceForPM,
} from './propertyManagerRPA.service';
import { PropertyManagerAssignmentModel } from '../models/propertyManagerAssignment.model';
import { RewardCatalogModel } from '../../tenant/models/rewardCatalog.model';
import { RedemptionModel } from '../../rewards/models/redemption.model';
import { TenantChallengeModel } from '../../tenant/models/tenantChallenge.model';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { fulfillRedemption } from '../../rewards/services/fulfillment.service';
import { issueCreditsToTenant } from '../../ledger/services/issueCredits.service';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { listLandlordRewards, createLandlordReward } from '../../landlord-rewards/services/landlordRewards.service';
import { createRewardsCampaign, listRewardsCampaigns } from '../../rewardsCampaigns/services/rewardsCampaigns.service';
import { createChallenge } from '../../tenant/services/challenges.service';

const PM_USER = new mongoose.Types.ObjectId();
const ORG_A = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const PROPERTY_B = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();

jest.mock('../models/propertyManagerAssignment.model', () => ({
  PropertyManagerAssignmentModel: { find: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../tenant/models/rewardCatalog.model', () => ({ RewardCatalogModel: { findById: jest.fn() } }));
jest.mock('../../rewards/models/redemption.model', () => ({ RedemptionModel: { find: jest.fn(), findById: jest.fn() } }));
jest.mock('../../tenant/models/tenantChallenge.model', () => ({ TenantChallengeModel: { find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn(), findOne: jest.fn() } }));
jest.mock('../../rewards/services/fulfillment.service', () => ({ fulfillRedemption: jest.fn() }));
jest.mock('../../ledger/services/issueCredits.service', () => ({ issueCreditsToTenant: jest.fn() }));
jest.mock('../../audit/services/audit.service', () => ({ writeAuditEvent: jest.fn().mockResolvedValue(null) }));
jest.mock('../../audit/models/audit-log.model', () => ({ AuditEvent: { create: jest.fn().mockResolvedValue(null) } }));
jest.mock('../../landlord-rewards/services/landlordRewards.service', () => ({
  listLandlordRewards: jest.fn(),
  createLandlordReward: jest.fn(),
}));
jest.mock('../../rewardsCampaigns/services/rewardsCampaigns.service', () => ({
  createRewardsCampaign: jest.fn(),
  listRewardsCampaigns: jest.fn(),
}));
jest.mock('../../tenant/services/challenges.service', () => ({ createChallenge: jest.fn() }));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('reward catalog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('listRewardCatalogForPM rejects without RPA_VIEW anywhere in the org', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions: [] }])
    );
    await expect(listRewardCatalogForPM(PM_USER, ORG_A.toString())).rejects.toMatchObject({ statusCode: 403 });
    expect(listLandlordRewards).not.toHaveBeenCalled();
  });

  it('listRewardCatalogForPM succeeds when RPA_VIEW is granted', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions: ['RPA_VIEW'] }])
    );
    (listLandlordRewards as jest.Mock).mockResolvedValue([{ rewardId: 'r1' }]);

    const result = await listRewardCatalogForPM(PM_USER, ORG_A.toString());
    expect(result).toEqual([{ rewardId: 'r1' }]);
  });

  it('createRewardCatalogEntryForPM rejects without RPA_CREATE_REWARD', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions: ['RPA_VIEW'] }])
    );
    await expect(
      createRewardCatalogEntryForPM(PM_USER, ORG_A.toString(), {} as any)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(createLandlordReward).not.toHaveBeenCalled();
  });

  it('createRewardCatalogEntryForPM creates when granted', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions: ['RPA_CREATE_REWARD'] }])
    );
    (createLandlordReward as jest.Mock).mockResolvedValue({ id: new mongoose.Types.ObjectId().toString(), rewardId: 'r1' });

    const result = await createRewardCatalogEntryForPM(PM_USER, ORG_A.toString(), { rewardId: 'r1' } as any);
    expect(result.rewardId).toBe('r1');
    expect(createLandlordReward).toHaveBeenCalledWith(ORG_A.toString(), { rewardId: 'r1' });
  });
});

describe('campaigns', () => {
  beforeEach(() => jest.clearAllMocks());

  it('listCampaignsForPM returns empty when no property grants RPA_VIEW', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions: [] }])
    );
    const result = await listCampaignsForPM(PM_USER, ORG_A.toString());
    expect(result.campaigns).toEqual([]);
  });

  it('listCampaignsForPM rejects a specific propertyId without RPA_VIEW there', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions: ['RPA_VIEW'] }])
    );
    await expect(
      listCampaignsForPM(PM_USER, ORG_A.toString(), PROPERTY_B.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('listCampaignsForPM filters org-wide results down to permitted properties only', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions: ['RPA_VIEW'] }])
    );
    (listRewardsCampaigns as jest.Mock).mockResolvedValue([
      { propertyId: PROPERTY_A, goal: 'A' },
      { propertyId: PROPERTY_B, goal: 'B' },
    ]);

    const result = await listCampaignsForPM(PM_USER, ORG_A.toString());
    expect(result.campaigns).toEqual([{ propertyId: PROPERTY_A, goal: 'A' }]);
  });

  it('createCampaignForPM rejects without RPA_CREATE_CAMPAIGN on the property', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, orgId: ORG_A, permissions: [] })
    );
    await expect(
      createCampaignForPM(PM_USER, PROPERTY_A.toString(), { goal: 'g', budget: 100, eligibleBehaviors: ['ON_TIME_RENT'] })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('createCampaignForPM creates when granted', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, orgId: ORG_A, permissions: ['RPA_CREATE_CAMPAIGN'] })
    );
    (createRewardsCampaign as jest.Mock).mockResolvedValue({ _id: new mongoose.Types.ObjectId(), goal: 'g' });

    const result = await createCampaignForPM(PM_USER, PROPERTY_A.toString(), { goal: 'g', budget: 100, eligibleBehaviors: ['ON_TIME_RENT'] });
    expect((result as any).goal).toBe('g');
    expect(createRewardsCampaign).toHaveBeenCalledWith(ORG_A.toString(), expect.objectContaining({ propertyId: PROPERTY_A.toString() }));
  });
});

describe('challenges', () => {
  beforeEach(() => jest.clearAllMocks());

  it('createChallengeForPM rejects without RPA_CREATE_CHALLENGE', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, orgId: ORG_A, permissions: [] })
    );
    await expect(
      createChallengeForPM(PM_USER, PROPERTY_A.toString(), {} as any)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('createChallengeForPM sets creatorType PROPERTY_MANAGER', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, orgId: ORG_A, permissions: ['RPA_CREATE_CHALLENGE'] })
    );
    (createChallenge as jest.Mock).mockResolvedValue({ _id: new mongoose.Types.ObjectId(), challengeId: 'c1' });

    await createChallengeForPM(PM_USER, PROPERTY_A.toString(), { challengeId: 'c1' } as any);

    expect(createChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ creatorType: 'PROPERTY_MANAGER', createdBy: PM_USER, orgId: ORG_A, propertyId: PROPERTY_A })
    );
  });
});

describe('redemption approvals', () => {
  beforeEach(() => jest.clearAllMocks());

  function mockScope(permissions: string[]) {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions }])
    );
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1 }]));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([{ tenantUserId: TENANT_1 }]));
  }

  it('listPendingRedemptionsForPM returns empty with no RPA_VIEW anywhere', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(leanChain([{ propertyId: PROPERTY_A, permissions: [] }]));
    const result = await listPendingRedemptionsForPM(PM_USER, ORG_A.toString());
    expect(result.items).toEqual([]);
  });

  it('reviewRedemptionForPM rejects without RPA_APPROVE_REDEMPTION', async () => {
    mockScope(['RPA_VIEW']);
    await expect(
      reviewRedemptionForPM(PM_USER, ORG_A.toString(), new mongoose.Types.ObjectId().toString(), { action: 'APPROVE' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('reviewRedemptionForPM rejects a tenant outside the PM-managed scope', async () => {
    mockScope(['RPA_APPROVE_REDEMPTION']);
    const otherTenant = new mongoose.Types.ObjectId();
    (RedemptionModel.findById as jest.Mock).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(), tenantUserId: otherTenant, approvalStatus: 'PENDING',
    });

    await expect(
      reviewRedemptionForPM(PM_USER, ORG_A.toString(), new mongoose.Types.ObjectId().toString(), { action: 'APPROVE' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('reviewRedemptionForPM rejects a redemption not in PENDING status', async () => {
    mockScope(['RPA_APPROVE_REDEMPTION']);
    (RedemptionModel.findById as jest.Mock).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, approvalStatus: 'APPROVED',
    });

    await expect(
      reviewRedemptionForPM(PM_USER, ORG_A.toString(), new mongoose.Types.ObjectId().toString(), { action: 'APPROVE' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('reviewRedemptionForPM handles REJECT without calling fulfillment', async () => {
    mockScope(['RPA_APPROVE_REDEMPTION']);
    const redemption: any = { _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, approvalStatus: 'PENDING' };
    redemption.save = jest.fn().mockImplementation(async () => redemption);
    (RedemptionModel.findById as jest.Mock).mockResolvedValue(redemption);

    const result = await reviewRedemptionForPM(PM_USER, ORG_A.toString(), redemption._id.toString(), {
      action: 'REJECT', rejectionReason: 'not eligible',
    });

    expect(redemption.approvalStatus).toBe('REJECTED');
    expect(result.approvalStatus).toBe('REJECTED');
    expect(fulfillRedemption).not.toHaveBeenCalled();
    expect(writeAuditEvent).toHaveBeenCalled();
  });

  it('reviewRedemptionForPM handles APPROVE and triggers fulfillment', async () => {
    mockScope(['RPA_APPROVE_REDEMPTION']);
    const redemption: any = { _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, rewardId: new mongoose.Types.ObjectId(), approvalStatus: 'PENDING' };
    redemption.save = jest.fn().mockImplementation(async () => redemption);
    (RedemptionModel.findById as jest.Mock)
      .mockResolvedValueOnce(redemption)
      .mockReturnValueOnce(leanChain({ ...redemption, approvalStatus: 'APPROVED', fulfillment: { type: 'GIFT_CARD' } }));
    (RewardCatalogModel.findById as jest.Mock).mockReturnValue(leanChain({ category: 'GIFT_CARD', rewardId: 'r1' }));

    const result = await reviewRedemptionForPM(PM_USER, ORG_A.toString(), redemption._id.toString(), { action: 'APPROVE' });

    expect(redemption.approvalStatus).toBe('APPROVED');
    expect(fulfillRedemption).toHaveBeenCalled();
    expect(result.approvalStatus).toBe('APPROVED');
  });
});

describe('adjustTenantBalanceForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects without RPA_ADJUST_BALANCE on the property', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, orgId: ORG_A, permissions: [] })
    );
    await expect(
      adjustTenantBalanceForPM(PM_USER, PROPERTY_A.toString(), TENANT_1.toString(), { amount: 10, reason: 'x' })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(issueCreditsToTenant).not.toHaveBeenCalled();
  });

  it('rejects a tenant with no active tenancy on a unit of this property', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, orgId: ORG_A, permissions: ['RPA_ADJUST_BALANCE'] })
    );
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1 }]));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));

    await expect(
      adjustTenantBalanceForPM(PM_USER, PROPERTY_A.toString(), TENANT_1.toString(), { amount: 10, reason: 'x' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('issues credits when granted and the tenant is in scope', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, orgId: ORG_A, permissions: ['RPA_ADJUST_BALANCE'] })
    );
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1 }]));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain({ tenantUserId: TENANT_1, unitId: UNIT_1 }));
    (issueCreditsToTenant as jest.Mock).mockResolvedValue({ event: {}, accountId: new mongoose.Types.ObjectId().toString() });

    const result = await adjustTenantBalanceForPM(PM_USER, PROPERTY_A.toString(), TENANT_1.toString(), { amount: 50, reason: 'good tenant' });

    expect(issueCreditsToTenant).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 50, reason: 'good tenant', type: 'ADJUST' }),
      ORG_A.toString(),
      PM_USER
    );
    expect(result.accountId).toBeDefined();
    expect(writeAuditEvent).toHaveBeenCalled();
  });
});

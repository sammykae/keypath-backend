import mongoose from 'mongoose';
import { getLandlordReportKpis, listOrgUnitsByStatus } from './landlordReportsKpi.service';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { PropertyFinancingModel } from '../../properties/models/propertyFinancing.model';
import { TokenLedgerModel } from '../../tokens/models/tokenLedgerModel';
import { TenantParticipationModel } from '../../tenant-participation/models/tenantParticipation.model';
import { CampaignModel } from '../../campaign/models/campaign.model';
import { getCampaignMetricsMap } from '../../campaign/services/campaignMetrics.service';
import { resolveLandlordOrgId } from './landlordDashboard.service';

const ORG_ID = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();
const UNIT_2 = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();
const LANDLORD_1 = new mongoose.Types.ObjectId();

jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn() } }));
jest.mock('../../finances/models/unitFinancialsModel', () => ({ UnitFinancialsModel: { find: jest.fn() } }));
jest.mock('../../properties/models/propertyFinancing.model', () => ({ PropertyFinancingModel: { find: jest.fn() } }));
jest.mock('../../tokens/models/tokenLedgerModel', () => ({ TokenLedgerModel: { aggregate: jest.fn() } }));
jest.mock('../../tenant-participation/models/tenantParticipation.model', () => ({
  TenantParticipationModel: { find: jest.fn() },
}));
jest.mock('../../campaign/models/campaign.model', () => ({ CampaignModel: { find: jest.fn() } }));
jest.mock('../../campaign/services/campaignMetrics.service', () => ({ getCampaignMetricsMap: jest.fn() }));
jest.mock('./landlordDashboard.service', () => ({ resolveLandlordOrgId: jest.fn() }));

function leanChain<T>(value: T) {
  return { select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }), lean: jest.fn().mockResolvedValue(value) };
}

describe('getLandlordReportKpis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveLandlordOrgId as jest.Mock).mockResolvedValue(ORG_ID.toString());
    (PropertyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: PROPERTY_A, name: 'Maple St', status: 'LIVE', participationModel: 'BOTH' }])
    );
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', unitNumber: '1A', rent: 1000 },
        { _id: UNIT_2, propertyId: PROPERTY_A, status: 'VACANT', unitNumber: '1B', rent: 1200 },
      ])
    );
    (TenancyModel.find as jest.Mock).mockReturnValue(
      leanChain([
        {
          _id: new mongoose.Types.ObjectId(),
          tenantUserId: TENANT_1,
          unitId: UNIT_1,
          status: 'ACTIVE',
          leaseStart: new Date(2025, 0, 1),
          leaseEnd: new Date(2026, 11, 31),
        },
      ])
    );
    (UnitFinancialsModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (PropertyFinancingModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (TokenLedgerModel.aggregate as jest.Mock).mockResolvedValue([]);
    (TenantParticipationModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (CampaignModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (getCampaignMetricsMap as jest.Mock).mockResolvedValue(new Map());
  });

  it('resolves the org via resolveLandlordOrgId and scopes every query by it', async () => {
    await getLandlordReportKpis(LANDLORD_1, '30d', null);
    expect(resolveLandlordOrgId).toHaveBeenCalledWith(LANDLORD_1, null);
    expect(PropertyModel.find).toHaveBeenCalledWith({ orgId: ORG_ID });
  });

  it('computes occupancy from active tenancies and the raw Unit.status breakdown', async () => {
    const result = await getLandlordReportKpis(LANDLORD_1, '30d', null);
    expect(result.occupancy.current.occupied).toBe(1);
    expect(result.occupancy.current.total).toBe(2);
    expect(result.occupancy.current.occupancyRate).toBe(50);
    expect(result.occupancy.current.byUnitStatus).toEqual({ VACANT: 1, OCCUPIED: 1, TURN: 0, OFFLINE: 0 });
  });

  it('defaults investorOwnerMix to null (no named-investor entity in this product)', async () => {
    const result = await getLandlordReportKpis(LANDLORD_1, '30d', null);
    expect(result.investorOwnerMix).toBeNull();
  });

  it('returns portfolioSummary consistent with the occupancy calc', async () => {
    const result = await getLandlordReportKpis(LANDLORD_1, '30d', null);
    expect(result.portfolioSummary).toMatchObject({
      totalProperties: 1,
      totalUnits: 2,
      occupiedUnits: 1,
      occupancyRate: 50,
      activeTenants: 1,
    });
  });

  it('sizes the lease-exposure forward window from the requested range (90d -> next 90 days)', async () => {
    const result = await getLandlordReportKpis(LANDLORD_1, '90d', null);
    expect(result.leaseExposure.windowDays).toBe(90);
  });

  it('builds an equityCreditsMix (not "ownershipMix") from token ledger pool totals', async () => {
    (TokenLedgerModel.aggregate as jest.Mock).mockResolvedValue([
      { _id: 'TENANT', total: 60 },
      { _id: 'LANDLORD', total: 40 },
    ]);
    const result = await getLandlordReportKpis(LANDLORD_1, '30d', null);
    expect(result.tenantParticipation.equityCreditsMix).toEqual([
      { name: 'Landlord', value: 40 },
      { name: 'Tenants', value: 60 },
    ]);
  });

  it('rolls up rewards budget vs spent across every campaign in the org', async () => {
    const campaignId = new mongoose.Types.ObjectId();
    (CampaignModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: campaignId, name: 'Spring Promo', status: 'ACTIVE', budgetUsd: 1000, budgetTokenCap: 500 }])
    );
    (getCampaignMetricsMap as jest.Mock).mockResolvedValue(
      new Map([[campaignId.toString(), { tokensIssued: 250, participantCount: 3 }]])
    );

    const result = await getLandlordReportKpis(LANDLORD_1, '30d', null);

    expect(result.rewardsBudget.totalBudgetUsd).toBe(1000);
    expect(result.rewardsBudget.totalSpentUsd).toBe(500); // 250/500 tokens = 50% of $1000
    expect(result.rewardsBudget.remainingUsd).toBe(500);
    expect(result.rewardsBudget.byCampaign).toEqual([
      expect.objectContaining({ campaignId: campaignId.toString(), spentUsd: 500, tokensIssued: 250 }),
    ]);
  });

  it('builds a quarter-bucketed debt maturity ladder from PropertyFinancing records', async () => {
    (PropertyFinancingModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { maturityDate: new Date(2027, 7, 1), outstandingBalance: 100000, principal: 120000 },
        { maturityDate: new Date(2027, 8, 1), outstandingBalance: 50000, principal: 60000 },
      ])
    );

    const result = await getLandlordReportKpis(LANDLORD_1, '30d', null);

    expect(result.debtMaturityLadder.ladder).toEqual([{ period: '2027 Q3', balance: 150000 }]);
    expect(result.debtMaturityLadder.summary.totalOutstanding).toBe(150000);
  });
});

describe('listOrgUnitsByStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveLandlordOrgId as jest.Mock).mockResolvedValue(ORG_ID.toString());
  });

  it('returns only units matching the requested status, across the whole org', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: PROPERTY_A, name: 'Maple St' }]));
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: UNIT_2, propertyId: PROPERTY_A, status: 'VACANT', unitNumber: '1B', rent: 1200 }])
    );

    const result = await listOrgUnitsByStatus(LANDLORD_1, 'VACANT', null);

    expect(UnitModel.find).toHaveBeenCalledWith({ propertyId: { $in: [PROPERTY_A] }, status: 'VACANT' });
    expect(result).toEqual([
      { unitId: UNIT_2.toString(), unitNumber: '1B', propertyId: PROPERTY_A.toString(), propertyName: 'Maple St', status: 'VACANT', rent: 1200 },
    ]);
  });
});

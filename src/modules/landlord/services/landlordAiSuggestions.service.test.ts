import mongoose from 'mongoose';
import { getLandlordAiSuggestions } from './landlordAiSuggestions.service';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { MaintenanceTicketModel } from '../../maintenance/models/maintenanceTicket.model';
import { listGoodStandingForOrg } from '../../good-standing/services/goodStanding.service';
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
jest.mock('../../maintenance/models/maintenanceTicket.model', () => ({ MaintenanceTicketModel: { aggregate: jest.fn() } }));
jest.mock('../../good-standing/services/goodStanding.service', () => ({ listGoodStandingForOrg: jest.fn() }));
jest.mock('./landlordDashboard.service', () => ({ resolveLandlordOrgId: jest.fn() }));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

const BASE_PROPERTY = { _id: PROPERTY_A, name: 'Maple St', orgId: ORG_ID };

describe('getLandlordAiSuggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveLandlordOrgId as jest.Mock).mockResolvedValue(ORG_ID.toString());
    (UnitFinancialsModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (MaintenanceTicketModel.aggregate as jest.Mock).mockResolvedValue([]);
    (listGoodStandingForOrg as jest.Mock).mockResolvedValue([]);
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([]));
  });

  it('returns a single GENERAL empty-state suggestion when the landlord has no properties yet', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([]));

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({ type: 'GENERAL' });
    expect(result.suggestions[0].sourceData).toEqual({ propertyCount: 0 });
  });

  it('flags vacancy from real Unit.status counts, with exact numbers in the text', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000 },
        { _id: UNIT_2, propertyId: PROPERTY_A, status: 'VACANT', rent: 1200 },
      ])
    );

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    const vacancy = result.suggestions.find((s) => s.type === 'VACANCY');
    expect(vacancy).toBeDefined();
    expect(vacancy!.text).toBe('1 of 2 units (50%) are currently vacant.');
    expect(vacancy!.sourceData).toMatchObject({ vacantCount: 1, totalUnits: 2, vacantRate: 50 });
  });

  it('does not flag vacancy when no units are vacant', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000 }])
    );

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    expect(result.suggestions.find((s) => s.type === 'VACANCY')).toBeUndefined();
  });

  it('flags below-market rent only when marketRent is actually recorded and higher than rent', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000, marketRent: 1200 },
        { _id: UNIT_2, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1500 }, // no marketRent set
      ])
    );

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    const revenue = result.suggestions.find((s) => s.type === 'REVENUE');
    expect(revenue).toBeDefined();
    expect(revenue!.text).toContain('$200/month');
    expect((revenue!.sourceData as any).units).toHaveLength(1);
  });

  it('does not fabricate a revenue suggestion when no unit has marketRent set', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000 }])
    );

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    expect(result.suggestions.find((s) => s.type === 'REVENUE')).toBeUndefined();
  });

  it('flags renewal risk for active tenancies expiring within 30 days', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000 }]));
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    (TenancyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, unitId: UNIT_1, status: 'ACTIVE', leaseEnd: soon }])
    );

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    const renewal = result.suggestions.find((s) => s.type === 'RENEWAL_RISK');
    expect(renewal).toBeDefined();
    expect(renewal!.text).toBe('1 lease expires within the next 30 days.');
    expect((renewal!.sourceData as any).count).toBe(1);
  });

  it('flags retention for a good-standing tenant with a lease expiring within 60 days', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000 }]));
    const soon = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    (TenancyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, unitId: UNIT_1, status: 'ACTIVE', leaseEnd: soon }])
    );
    (listGoodStandingForOrg as jest.Mock).mockResolvedValue([
      { tenantUserId: TENANT_1.toString(), propertyName: 'Maple St', status: 'ACTIVE', reasons: ['Rent current, no active flags'], arrearsDays: 0 },
    ]);

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    const retention = result.suggestions.find((s) => s.type === 'RETENTION');
    expect(retention).toBeDefined();
    expect((retention!.sourceData as any).count).toBe(1);
  });

  it('does not flag retention for a tenant not in ACTIVE good standing', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000 }]));
    const soon = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    (TenancyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, unitId: UNIT_1, status: 'ACTIVE', leaseEnd: soon }])
    );
    (listGoodStandingForOrg as jest.Mock).mockResolvedValue([
      { tenantUserId: TENANT_1.toString(), propertyName: 'Maple St', status: 'AT_RISK', reasons: ['Rent 5 days late'], arrearsDays: 5 },
    ]);

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    expect(result.suggestions.find((s) => s.type === 'RETENTION')).toBeUndefined();
  });

  it('flags tenants at risk from non-ACTIVE Good Standing status, with real reasons in sourceData', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000 }]));
    (listGoodStandingForOrg as jest.Mock).mockResolvedValue([
      { tenantUserId: TENANT_1.toString(), propertyName: 'Maple St', status: 'PAUSED', reasons: ['Rent 45 days late'], arrearsDays: 45 },
    ]);

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    const atRisk = result.suggestions.find((s) => s.type === 'TENANT_AT_RISK');
    expect(atRisk).toBeDefined();
    expect((atRisk!.sourceData as any).tenants[0].reasons).toEqual(['Rent 45 days late']);
  });

  it('flags late rent tenants using real arrearsDays, not a fabricated percentage', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000 }]));
    (listGoodStandingForOrg as jest.Mock).mockResolvedValue([
      { tenantUserId: TENANT_1.toString(), propertyName: 'Maple St', status: 'AT_RISK', reasons: ['Rent 12 days late'], arrearsDays: 12 },
    ]);

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    const lateRent = result.suggestions.find((s) => s.type === 'LATE_RENT');
    expect(lateRent).toBeDefined();
    expect(lateRent!.text).toContain('12 days late');
  });

  it('flags maintenance/CapEx risk when a unit has 3+ tickets in the lookback window', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000 }]));
    (MaintenanceTicketModel.aggregate as jest.Mock).mockResolvedValue([
      { _id: UNIT_1, count: 4, propertyId: PROPERTY_A, issueTypes: ['PLUMBING', 'PLUMBING', 'PLUMBING', 'HVAC'] },
    ]);

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    const maintenance = result.suggestions.find((s) => s.type === 'MAINTENANCE_CAPEX');
    expect(maintenance).toBeDefined();
    expect(maintenance!.text).toContain('4 tickets');
    expect(maintenance!.text).toContain('PLUMBING');
  });

  it('flags operating performance when a property collects under 90% of scheduled rent this month', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000 }]));
    (UnitFinancialsModel.find as jest.Mock).mockReturnValue(
      leanChain([{ unitId: UNIT_1, rentScheduled: 1000, rentCollected: 700 }])
    );

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    const perf = result.suggestions.find((s) => s.type === 'OPERATING_PERFORMANCE');
    expect(perf).toBeDefined();
    expect((perf!.sourceData as any).properties[0].collectionRate).toBe(70);
  });

  it('falls back to a single honest GENERAL suggestion when the portfolio has no risk signals at all', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1000 }]));

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].type).toBe('GENERAL');
    expect(result.suggestions[0].text).not.toMatch(/\d+%/); // no fabricated percentage claim
  });

  it('never includes a fabricated improvement-percentage claim in any suggestion text', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([BASE_PROPERTY]));
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { _id: UNIT_1, propertyId: PROPERTY_A, status: 'VACANT', rent: 1000, marketRent: 1300 },
        { _id: UNIT_2, propertyId: PROPERTY_A, status: 'OCCUPIED', rent: 1200 },
      ])
    );
    (listGoodStandingForOrg as jest.Mock).mockResolvedValue([
      { tenantUserId: TENANT_1.toString(), propertyName: 'Maple St', status: 'PAUSED', reasons: ['Rent 40 days late'], arrearsDays: 40 },
    ]);

    const result = await getLandlordAiSuggestions(LANDLORD_1, null);

    for (const s of result.suggestions) {
      expect(s.text).not.toMatch(/reduce .* by up to|renew at \d+x|extend lease duration by/i);
    }
  });
});

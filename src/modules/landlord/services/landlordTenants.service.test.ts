import mongoose from 'mongoose';
import { listLandlordTenants } from './landlordTenants.service';
import { User } from '../../auth/models/user.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { UnitFinancialsModel } from '../../finances/models/unitFinancialsModel';
import { getBalance } from '../../ledger/services/balanceService';
import { resolveLandlordOrgId } from './landlordDashboard.service';
import { TenantGoodStandingModel } from '../../good-standing/models/goodStanding.model';

const ORG_ID = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();
const UNIT_2 = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();
const TENANT_2 = new mongoose.Types.ObjectId();
const LANDLORD_1 = new mongoose.Types.ObjectId();

jest.mock('../../auth/models/user.model', () => ({ User: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { find: jest.fn() } }));
jest.mock('../../ledger/models/creditAccountModel', () => ({ CreditAccountModel: { find: jest.fn() } }));
jest.mock('../../finances/models/unitFinancialsModel', () => ({ UnitFinancialsModel: { aggregate: jest.fn() } }));
jest.mock('../../ledger/services/balanceService', () => ({ getBalance: jest.fn() }));
jest.mock('./landlordDashboard.service', () => ({ resolveLandlordOrgId: jest.fn() }));
jest.mock('../../good-standing/models/goodStanding.model', () => {
  const actual = jest.requireActual('../../good-standing/models/goodStanding.model');
  return { ...actual, TenantGoodStandingModel: { find: jest.fn() } };
});

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}
function sortChain<T>(value: T) {
  return { sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(leanChain(value)) }) };
}

function makeTenancy(overrides: Record<string, any> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    tenantUserId: TENANT_1,
    unitId: UNIT_1,
    status: 'ACTIVE',
    rentAmount: 1000,
    leaseStart: new Date(2025, 0, 1),
    leaseEnd: new Date(2026, 5, 1),
    ...overrides,
  };
}

describe('listLandlordTenants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveLandlordOrgId as jest.Mock).mockResolvedValue(ORG_ID.toString());
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: PROPERTY_A, name: 'Maple St', participationModel: 'RPA_ONLY' }]));
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { _id: UNIT_1, propertyId: PROPERTY_A, unitNumber: '1A' },
        { _id: UNIT_2, propertyId: PROPERTY_A, unitNumber: '1B' },
      ])
    );
    (User.find as jest.Mock).mockReturnValue(
      leanChain([
        { _id: TENANT_1, email: 'a@test.com', profile: {} },
        { _id: TENANT_2, email: 'b@test.com', profile: {} },
      ])
    );
    (CreditAccountModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (getBalance as jest.Mock).mockResolvedValue(0);
    (UnitFinancialsModel.aggregate as jest.Mock).mockResolvedValue([]);
    (TenantGoodStandingModel.find as jest.Mock).mockReturnValue(leanChain([]));
  });

  it('defaults to cursor-based _id pagination when no sortBy is given', async () => {
    (TenancyModel.find as jest.Mock).mockReturnValue(sortChain([makeTenancy()]));

    const result = await listLandlordTenants(LANDLORD_1, {});

    expect(TenancyModel.find).toHaveBeenCalled();
    expect(result.tenants).toHaveLength(1);
  });

  it('sorts by leaseEnd ascending (soonest-expiring first) when sortBy=leaseEnd', async () => {
    const soon = makeTenancy({ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, unitId: UNIT_1, leaseEnd: new Date(2026, 1, 1) });
    const later = makeTenancy({ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_2, unitId: UNIT_2, leaseEnd: new Date(2026, 6, 1) });
    (TenancyModel.find as jest.Mock).mockReturnValue(sortChain([later, soon])); // deliberately out of order

    const result = await listLandlordTenants(LANDLORD_1, { sortBy: 'leaseEnd', sortDir: 'asc' });

    expect(result.tenants.map((t) => t.tenantUserId)).toEqual([TENANT_1.toString(), TENANT_2.toString()]);
    expect(result.nextCursor).toBeNull();
  });

  it('sorts by leaseEnd descending when sortDir=desc', async () => {
    const soon = makeTenancy({ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, unitId: UNIT_1, leaseEnd: new Date(2026, 1, 1) });
    const later = makeTenancy({ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_2, unitId: UNIT_2, leaseEnd: new Date(2026, 6, 1) });
    (TenancyModel.find as jest.Mock).mockReturnValue(sortChain([soon, later]));

    const result = await listLandlordTenants(LANDLORD_1, { sortBy: 'leaseEnd', sortDir: 'desc' });

    expect(result.tenants.map((t) => t.tenantUserId)).toEqual([TENANT_2.toString(), TENANT_1.toString()]);
  });

  it('sorts by arrearsDays (a joined field, not on Tenancy directly) ascending by default', async () => {
    const t1 = makeTenancy({ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, unitId: UNIT_1 });
    const t2 = makeTenancy({ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_2, unitId: UNIT_2 });
    (TenancyModel.find as jest.Mock).mockReturnValue(sortChain([t1, t2]));
    (UnitFinancialsModel.aggregate as jest.Mock).mockResolvedValue([
      { _id: UNIT_1, arrearsAmount: 500, arrearsDays: 45 },
      { _id: UNIT_2, arrearsAmount: 50, arrearsDays: 5 },
    ]);

    const result = await listLandlordTenants(LANDLORD_1, { sortBy: 'arrearsDays' });

    expect(result.tenants.map((t) => t.arrearsDays)).toEqual([5, 45]);
  });

  it('sorts by arrearsDays descending (most-late-first) when sortDir=desc', async () => {
    const t1 = makeTenancy({ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, unitId: UNIT_1 });
    const t2 = makeTenancy({ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_2, unitId: UNIT_2 });
    (TenancyModel.find as jest.Mock).mockReturnValue(sortChain([t1, t2]));
    (UnitFinancialsModel.aggregate as jest.Mock).mockResolvedValue([
      { _id: UNIT_1, arrearsAmount: 500, arrearsDays: 45 },
      { _id: UNIT_2, arrearsAmount: 50, arrearsDays: 5 },
    ]);

    const result = await listLandlordTenants(LANDLORD_1, { sortBy: 'arrearsDays', sortDir: 'desc' });

    expect(result.tenants.map((t) => t.arrearsDays)).toEqual([45, 5]);
  });

  it('places tenants with no leaseEnd last regardless of sort direction', async () => {
    const withEnd = makeTenancy({ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, unitId: UNIT_1, leaseEnd: new Date(2026, 1, 1) });
    const noEnd = makeTenancy({ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_2, unitId: UNIT_2, leaseEnd: null });
    (TenancyModel.find as jest.Mock).mockReturnValue(sortChain([noEnd, withEnd]));

    const result = await listLandlordTenants(LANDLORD_1, { sortBy: 'leaseEnd' });

    expect(result.tenants.map((t) => t.tenantUserId)).toEqual([TENANT_1.toString(), TENANT_2.toString()]);
  });

  it('ignores an unrecognized sortBy value rather than throwing', async () => {
    (TenancyModel.find as jest.Mock).mockReturnValue(sortChain([makeTenancy()]));

    await expect(
      listLandlordTenants(LANDLORD_1, { sortBy: 'notAField' as any })
    ).resolves.toBeDefined();
  });
});

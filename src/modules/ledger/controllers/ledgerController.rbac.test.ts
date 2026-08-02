import mongoose from 'mongoose';
import { getTenantLedgerHandler, getPropertyLedgerHandler } from './ledgerController';
import { Membership } from '../../orgs/models/membership.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { listTokenLedgerEntries } from '../services/tokenLedger.service';

const TENANT_1 = new mongoose.Types.ObjectId();
const TENANT_2 = new mongoose.Types.ObjectId();
const LANDLORD_1 = new mongoose.Types.ObjectId();
const ORG_A = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();

jest.mock('../../orgs/models/membership.model', () => ({ Membership: { findOne: jest.fn() } }));
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { findOne: jest.fn(), find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../services/tokenLedger.service', () => ({ listTokenLedgerEntries: jest.fn().mockResolvedValue({ balance: 0, entries: [] }) }));
jest.mock('../services/ledgerService', () => ({ createCreditEvent: jest.fn(), findOrCreateCreditAccount: jest.fn() }));
jest.mock('../services/balanceService', () => ({ getBalance: jest.fn() }));
jest.mock('../services/issueCredits.service', () => ({
  resolveOrgAndVerifyAccess: jest.fn(), ensureTenantInOrg: jest.fn(), issueCreditsToTenant: jest.fn(),
}));
jest.mock('../services/ownershipCredits.service', () => ({ getOwnershipCredits: jest.fn() }));
jest.mock('../services/unifiedLedger.service', () => ({
  listUnifiedEntriesForTenant: jest.fn(), reconcileUnifiedBalancesForTenant: jest.fn(),
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('getTenantLedgerHandler — RBAC', () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects a tenant requesting another tenant's ledger", async () => {
    const req: any = { auth: { _id: TENANT_1, role: 'tenant' }, params: { tenant_id: TENANT_2.toString() } };
    const res = mockRes();

    await getTenantLedgerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(listTokenLedgerEntries).not.toHaveBeenCalled();
  });

  it('allows a tenant requesting their own ledger', async () => {
    const req: any = { auth: { _id: TENANT_1, role: 'tenant' }, params: { tenant_id: TENANT_1.toString() } };
    const res = mockRes();

    await getTenantLedgerHandler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(listTokenLedgerEntries).toHaveBeenCalledWith({ tenantId: TENANT_1.toString() });
  });

  it("rejects a landlord requesting a tenant outside their org", async () => {
    (Membership.findOne as jest.Mock).mockReturnValue(leanChain({ orgId: ORG_A }));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([{ unitId: UNIT_1 }]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ propertyId: PROPERTY_A }]));
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([])); // no property in this org

    const req: any = { auth: { _id: LANDLORD_1, role: 'landlord' }, params: { tenant_id: TENANT_2.toString() } };
    const res = mockRes();

    await getTenantLedgerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(listTokenLedgerEntries).not.toHaveBeenCalled();
  });

  it('allows a landlord requesting a tenant inside their org', async () => {
    (Membership.findOne as jest.Mock).mockReturnValue(leanChain({ orgId: ORG_A }));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([{ unitId: UNIT_1 }]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ propertyId: PROPERTY_A }]));
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: PROPERTY_A }]));

    const req: any = { auth: { _id: LANDLORD_1, role: 'landlord' }, params: { tenant_id: TENANT_2.toString() } };
    const res = mockRes();

    await getTenantLedgerHandler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(listTokenLedgerEntries).toHaveBeenCalledWith({ tenantId: TENANT_2.toString() });
  });
});

describe('getPropertyLedgerHandler — RBAC', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a tenant entirely (would leak every tenant on the property)', async () => {
    const req: any = { auth: { _id: TENANT_1, role: 'tenant' }, params: { id: PROPERTY_A.toString() } };
    const res = mockRes();

    await getPropertyLedgerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(listTokenLedgerEntries).not.toHaveBeenCalled();
  });

  it("rejects a landlord requesting a property outside their org", async () => {
    (Membership.findOne as jest.Mock).mockReturnValue(leanChain({ orgId: ORG_A }));
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));

    const req: any = { auth: { _id: LANDLORD_1, role: 'landlord' }, params: { id: PROPERTY_A.toString() } };
    const res = mockRes();

    await getPropertyLedgerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(listTokenLedgerEntries).not.toHaveBeenCalled();
  });

  it('allows a landlord requesting their own org property', async () => {
    (Membership.findOne as jest.Mock).mockReturnValue(leanChain({ orgId: ORG_A }));
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A }));

    const req: any = { auth: { _id: LANDLORD_1, role: 'landlord' }, params: { id: PROPERTY_A.toString() } };
    const res = mockRes();

    await getPropertyLedgerHandler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(listTokenLedgerEntries).toHaveBeenCalledWith({ propertyId: PROPERTY_A.toString() });
  });
});

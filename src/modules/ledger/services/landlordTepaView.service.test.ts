import mongoose from 'mongoose';
import { getTenantTEPASummaryForLandlord, getTenantTokenLedgerForLandlord } from './landlordTepaView.service';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { getVestingSummary } from './vesting.service';
import { listTokenLedgerEntries } from './tokenLedger.service';

const ORG_ID = '507f1f77bcf86cd7994390aa';
const LANDLORD_1 = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId().toString();
const PROPERTY_A = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();

jest.mock('../../landlord/services/landlordDashboard.service', () => ({
  resolveLandlordOrgId: jest.fn().mockResolvedValue('507f1f77bcf86cd7994390aa'),
}));
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { findOne: jest.fn() } }));
jest.mock('./vesting.service', () => ({ getVestingSummary: jest.fn() }));
jest.mock('./tokenLedger.service', () => ({ listTokenLedgerEntries: jest.fn() }));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('getTenantTEPASummaryForLandlord', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the tenant is not on any property in the org', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: PROPERTY_A }]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A }]));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));

    await expect(getTenantTEPASummaryForLandlord(LANDLORD_1, TENANT_1)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns the vesting summary when the tenant is on a property in the org', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: PROPERTY_A }]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A }]));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain({ unitId: UNIT_1 }));
    (getVestingSummary as jest.Mock).mockResolvedValue({ totalTokens: 100, vestedTokens: 60, unvestedTokens: 40 });

    const result = await getTenantTEPASummaryForLandlord(LANDLORD_1, TENANT_1);

    expect(result.totalTokens).toBe(100);
    expect(resolveLandlordOrgId).toHaveBeenCalledWith(LANDLORD_1);
  });
});

describe('getTenantTokenLedgerForLandlord', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopes the ledger query to the tenant\'s property when none is given explicitly', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: PROPERTY_A }]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A }]));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain({ unitId: UNIT_1 }));
    (listTokenLedgerEntries as jest.Mock).mockResolvedValue({ entries: [], balance: 0 });

    await getTenantTokenLedgerForLandlord(LANDLORD_1, TENANT_1);

    expect(listTokenLedgerEntries).toHaveBeenCalledWith({ tenantId: TENANT_1, propertyId: PROPERTY_A.toString() });
  });
});

import mongoose from 'mongoose';
import {
  getTenantTEPASummaryForPM,
  getTenantTokenLedgerForPM,
  getPropertyTEPASummaryForPM,
  listLiquidityRequestsForPM,
} from './propertyManagerTEPA.service';
import { PropertyManagerAssignmentModel } from '../models/propertyManagerAssignment.model';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User } from '../../auth/models/user.model';
import { getVestingSummary } from '../../ledger/services/vesting.service';
import { listTokenLedgerEntries } from '../../ledger/services/tokenLedger.service';
import { getGoodStanding } from '../../good-standing/services/goodStanding.service';
import { TepaEnrollment } from '../../tepa/models/tepa-enrollment.model';
import { LiquidityRequestModel } from '../../liquidity/models/liquidityRequest.model';

const PM_USER = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();

jest.mock('../models/propertyManagerAssignment.model', () => ({
  PropertyManagerAssignmentModel: { findOne: jest.fn() },
}));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn(), findOne: jest.fn() } }));
jest.mock('../../auth/models/user.model', () => ({ User: { find: jest.fn() } }));
jest.mock('../../ledger/services/vesting.service', () => ({ getVestingSummary: jest.fn() }));
jest.mock('../../ledger/services/tokenLedger.service', () => ({ listTokenLedgerEntries: jest.fn() }));
jest.mock('../../good-standing/services/goodStanding.service', () => ({ getGoodStanding: jest.fn() }));
jest.mock('../../tepa/models/tepa-enrollment.model', () => ({ TepaEnrollment: { findOne: jest.fn() } }));
jest.mock('../../liquidity/models/liquidityRequest.model', () => ({ LiquidityRequestModel: { find: jest.fn() } }));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}
function sortLeanChain<T>(value: T) {
  return { sort: jest.fn().mockReturnValue(leanChain(value)) };
}

describe('getTenantTEPASummaryForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects without TEPA_VIEW on the property', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, permissions: [] })
    );
    await expect(
      getTenantTEPASummaryForPM(PM_USER, PROPERTY_A.toString(), TENANT_1.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a tenant with no active tenancy on this property', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, permissions: ['TEPA_VIEW'] })
    );
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1 }]));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));

    await expect(
      getTenantTEPASummaryForPM(PM_USER, PROPERTY_A.toString(), TENANT_1.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('combines vesting, Good Standing, participation status, and agreement into one summary', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, permissions: ['TEPA_VIEW'] })
    );
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1 }]));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ tenantUserId: TENANT_1, unitId: UNIT_1, status: 'ACTIVE', tepaOptInStatus: 'OPTED_IN' })
    );
    (getVestingSummary as jest.Mock).mockResolvedValue({ totalTokens: 100, vestedTokens: 40, unvestedTokens: 60 });
    (getGoodStanding as jest.Mock).mockResolvedValue({ status: 'ACTIVE', reasons: [] });
    (TepaEnrollment.findOne as jest.Mock).mockReturnValue(
      sortLeanChain({ status: 'ACTIVE', consentVersion: 'v1', acceptedAt: new Date(), effectiveDate: new Date() })
    );

    const result = await getTenantTEPASummaryForPM(PM_USER, PROPERTY_A.toString(), TENANT_1.toString());

    expect(result.tepaParticipation).toBe('OPTED_IN');
    expect(result.vesting).toEqual({ totalTokens: 100, vestedTokens: 40, unvestedTokens: 60 });
    expect(result.goodStanding).toEqual({ status: 'ACTIVE', reasons: [] });
    expect(result.agreement).toMatchObject({ status: 'ACTIVE', consentVersion: 'v1' });
  });

  it('returns null agreement when no TepaEnrollment record exists', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, permissions: ['TEPA_VIEW'] })
    );
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1 }]));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ tenantUserId: TENANT_1, unitId: UNIT_1, status: 'ACTIVE', tepaOptInStatus: 'PENDING' })
    );
    (getVestingSummary as jest.Mock).mockResolvedValue(null);
    (getGoodStanding as jest.Mock).mockResolvedValue({ status: 'ACTIVE', reasons: [] });
    (TepaEnrollment.findOne as jest.Mock).mockReturnValue(sortLeanChain(null));

    const result = await getTenantTEPASummaryForPM(PM_USER, PROPERTY_A.toString(), TENANT_1.toString());
    expect(result.agreement).toBeNull();
  });
});

describe('getTenantTokenLedgerForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects without TEPA_VIEW', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, permissions: [] })
    );
    await expect(
      getTenantTokenLedgerForPM(PM_USER, PROPERTY_A.toString(), TENANT_1.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(listTokenLedgerEntries).not.toHaveBeenCalled();
  });

  it('fetches ledger entries scoped to tenant + property', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, permissions: ['TEPA_VIEW'] })
    );
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1 }]));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(leanChain({ tenantUserId: TENANT_1, unitId: UNIT_1 }));
    (listTokenLedgerEntries as jest.Mock).mockResolvedValue({ entries: [], balance: 40 });

    const result = await getTenantTokenLedgerForPM(PM_USER, PROPERTY_A.toString(), TENANT_1.toString());

    expect(listTokenLedgerEntries).toHaveBeenCalledWith({ tenantId: TENANT_1.toString(), propertyId: PROPERTY_A.toString() });
    expect(result.balance).toBe(40);
  });
});

describe('getPropertyTEPASummaryForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects without TEPA_VIEW', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, permissions: [] })
    );
    await expect(getPropertyTEPASummaryForPM(PM_USER, PROPERTY_A.toString())).rejects.toMatchObject({ statusCode: 403 });
  });

  it('only counts OPTED_IN active tenancies', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, permissions: ['TEPA_VIEW'] })
    );
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, unitNumber: '1A' }]));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([{ tenantUserId: TENANT_1, unitId: UNIT_1 }]));
    (User.find as jest.Mock).mockReturnValue(leanChain([{ _id: TENANT_1, email: 'tenant@test.com', profile: {} }]));

    const result = await getPropertyTEPASummaryForPM(PM_USER, PROPERTY_A.toString());

    expect(result.participantCount).toBe(1);
    expect(result.participants[0]).toMatchObject({ tenantUserId: TENANT_1.toString(), unitNumber: '1A' });
    // Confirm the query filtered to tepaOptInStatus OPTED_IN + ACTIVE only
    const filter = (TenancyModel.find as jest.Mock).mock.calls[0][0];
    expect(filter.tepaOptInStatus).toBe('OPTED_IN');
    expect(filter.status).toBe('ACTIVE');
  });
});

describe('listLiquidityRequestsForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects without TEPA_VIEW', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, permissions: [] })
    );
    await expect(listLiquidityRequestsForPM(PM_USER, PROPERTY_A.toString())).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns liquidity requests scoped to the property, no mutation methods exposed', async () => {
    (PropertyManagerAssignmentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ propertyId: PROPERTY_A, permissions: ['TEPA_VIEW'] })
    );
    (LiquidityRequestModel.find as jest.Mock).mockReturnValue(
      sortLeanChain([{
        _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, requestedTokens: 50,
        vestedTokensAtRequest: 60, status: 'SUBMITTED', rofrDecision: 'PENDING', transferStatus: 'NOT_STARTED',
        submittedAt: new Date(),
      }])
    );

    const result = await listLiquidityRequestsForPM(PM_USER, PROPERTY_A.toString());

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({ status: 'SUBMITTED', rofrDecision: 'PENDING' });
  });
});

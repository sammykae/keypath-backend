import mongoose from 'mongoose';
import { buildDebtCsv, buildPortfolioCsv } from './dataExport.controller';
import { getLandlordDebt } from '../../landlord/services/landlordDebt.service';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';

const USER_ID = new mongoose.Types.ObjectId();
const ORG_ID = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();
const UNIT_2 = new mongoose.Types.ObjectId();

jest.mock('../../landlord/services/landlordDebt.service', () => ({ getLandlordDebt: jest.fn() }));
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn() } }));
jest.mock('../../auth/models/user.model', () => ({ User: { find: jest.fn() } }));
jest.mock('../../finances/models/unitFinancialsModel', () => ({ UnitFinancialsModel: { find: jest.fn() } }));
jest.mock('../../loans/models/loanModel', () => ({ LoanModel: { find: jest.fn() } }));
jest.mock('../../landlord/services/landlordDashboard.service', () => ({ resolveLandlordOrgId: jest.fn() }));
jest.mock('../../landlord/services/landlordTenants.service', () => ({ listLandlordTenants: jest.fn() }));
jest.mock('../../landlord/services/landlordCompliance.service', () => ({ getLandlordCompliance: jest.fn() }));
jest.mock('../../ledger/models/tokenLedgerEntry.model', () => ({ TokenLedgerEntryModel: { find: jest.fn() } }));
jest.mock('../../rewards/models/redemption.model', () => ({ RedemptionModel: { find: jest.fn() } }));
jest.mock('../../rewards/models/reward.model', () => ({ RewardModel: { find: jest.fn() } }));
jest.mock('../../activities/models/activityModel', () => ({ ActivityModel: { find: jest.fn() } }));
jest.mock('../../tenant-participation/models/tenantParticipation.model', () => ({ TenantParticipationModel: { find: jest.fn() } }));
jest.mock('../../maintenance/models/maintenanceTicket.model', () => ({
  MaintenanceTicketModel: { find: jest.fn() },
  MAINTENANCE_STATUS_LABELS: {},
}));

function leanChain<T>(value: T) {
  const chain: any = { lean: jest.fn().mockResolvedValue(value), sort: jest.fn(() => chain), limit: jest.fn(() => chain) };
  return chain;
}

describe('buildDebtCsv', () => {
  beforeEach(() => jest.clearAllMocks());

  it('formats loan rows from the real debt service (PropertyFinancingModel-backed)', async () => {
    (getLandlordDebt as jest.Mock).mockResolvedValue({
      loanRows: [{
        propertyName: 'Maple St', lenderName: 'Chase', type: 'FIXED', principal: 500000,
        interestRate: 4.5, outstandingBalance: 400000, monthlyInterest: 1500, ltv: 65,
        repaidPct: 20, maturityDate: '2030-01-01T00:00:00.000Z',
      }],
    });

    const csv = await buildDebtCsv(USER_ID);

    expect(getLandlordDebt).toHaveBeenCalledWith(USER_ID);
    expect(csv).toContain('Maple St');
    expect(csv).toContain('Chase');
    expect(csv).toContain('65');
    expect(csv.split('\n')).toHaveLength(2); // header + 1 row
  });

  it('handles an empty debt portfolio', async () => {
    (getLandlordDebt as jest.Mock).mockResolvedValue({ loanRows: [] });
    const csv = await buildDebtCsv(USER_ID);
    expect(csv.split('\n')).toHaveLength(1); // header only
  });
});

describe('buildPortfolioCsv', () => {
  beforeEach(() => jest.clearAllMocks());

  it('computes occupancy rate per property', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: PROPERTY_A, name: 'Maple St', status: 'LIVE', address: { city: 'Austin', state: 'TX' }, type: 'SFR' }])
    );
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { _id: UNIT_1, propertyId: PROPERTY_A },
        { _id: UNIT_2, propertyId: PROPERTY_A },
      ])
    );
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([{ unitId: UNIT_1, status: 'ACTIVE' }]));

    const csv = await buildPortfolioCsv(ORG_ID);

    expect(csv).toContain('Maple St');
    expect(csv).toContain('50.0%');
  });

  it('handles a property with zero units without dividing by zero', async () => {
    (PropertyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: PROPERTY_A, name: 'Empty Lot', status: 'ONBOARDING', address: {}, type: 'SFR' }])
    );
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([]));

    const csv = await buildPortfolioCsv(ORG_ID);

    expect(csv).toContain('Empty Lot');
    expect(csv).toContain('0.0%');
  });
});

import mongoose from 'mongoose';
import { getTenantDashboard } from './tenantDashboard.service';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { CreditEventModel } from '../../ledger/models/creditEventModel';
import { getBalance } from '../../ledger/services/balanceService';
import { PaymentModel } from '../../payments/models/payment.model';
import { TokenLedgerEntryModel } from '../../ledger/models/tokenLedgerEntry.model';
import { CapTableSnapshotModel } from '../../cap-table/models/capTableSnapshot.model';
import { MaintenanceTicketModel } from '../../maintenance/models/maintenanceTicket.model';
import { getVestingSummary, computeVesting } from '../../ledger/services/vesting.service';
import { listTokenLedgerEntries } from '../../ledger/services/tokenLedger.service';
import { getTenantAgreements } from '../../agreements/services/agreement.service';

const TENANT_1 = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();

jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { findOne: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { findById: jest.fn() } }));
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { findById: jest.fn() } }));
jest.mock('../../ledger/models/creditAccountModel', () => ({ CreditAccountModel: { find: jest.fn() } }));
jest.mock('../../ledger/models/creditEventModel', () => ({ CreditEventModel: { find: jest.fn() } }));
jest.mock('../../ledger/services/balanceService', () => ({ getBalance: jest.fn().mockResolvedValue(0) }));
jest.mock('../../payments/models/payment.model', () => ({
  PaymentModel: { findOne: jest.fn(), find: jest.fn(), countDocuments: jest.fn().mockResolvedValue(0) },
}));
jest.mock('../../ledger/models/tokenLedgerEntry.model', () => ({ TokenLedgerEntryModel: { find: jest.fn(), aggregate: jest.fn() } }));
jest.mock('../../cap-table/models/capTableSnapshot.model', () => ({ CapTableSnapshotModel: { findOne: jest.fn() } }));
jest.mock('../../maintenance/models/maintenanceTicket.model', () => ({ MaintenanceTicketModel: { find: jest.fn() } }));
jest.mock('../../ledger/services/vesting.service', () => ({ getVestingSummary: jest.fn(), computeVesting: jest.fn() }));
jest.mock('../../ledger/services/tokenLedger.service', () => ({ listTokenLedgerEntries: jest.fn() }));
jest.mock('../../agreements/services/agreement.service', () => ({ getTenantAgreements: jest.fn() }));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}
/** .sort().lean() — used by PaymentModel.findOne. */
function sortChain<T>(value: T) {
  return { sort: jest.fn().mockReturnValue(leanChain(value)) };
}
/** .sort().lean().exec() — used only by the TenancyModel.findOne lookup. */
function sortLeanExecChain<T>(value: T) {
  return { sort: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(value) }) }) };
}

describe('getTenantDashboard — RPA/TEPA separation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TenancyModel.findOne as jest.Mock).mockReturnValue(sortLeanExecChain({
      _id: new mongoose.Types.ObjectId(), unitId: UNIT_1, leaseStart: new Date(), leaseEnd: new Date(), rentAmount: 1500, status: 'ACTIVE',
    }));
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_1, propertyId: PROPERTY_A, unitNumber: '1A' }));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, name: 'Maple St', address: {}, valuationUsd: 500000 }));
    (CreditAccountModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (CreditEventModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (PaymentModel.findOne as jest.Mock).mockReturnValue(sortChain(null));
    (PaymentModel.find as jest.Mock).mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(leanChain([])) }) });
    (MaintenanceTicketModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (CapTableSnapshotModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    (TokenLedgerEntryModel.aggregate as jest.Mock).mockResolvedValue([]);
    (TokenLedgerEntryModel.find as jest.Mock).mockReturnValue({ select: jest.fn().mockReturnValue(leanChain([])) });
    (getTenantAgreements as jest.Mock).mockResolvedValue([]);
  });

  it('reports rewardsPoints and equityCredits as separate, non-conflated fields', async () => {
    (getVestingSummary as jest.Mock).mockResolvedValue({
      totalTokens: 100, vestedTokens: 60, unvestedTokens: 40,
      tokenValueUsd: 10, totalValueUsd: 1000, vestedValueUsd: 600,
      monthlyAccrualTokens: 5, vestingMonths: 12, tokensEnabled: true,
      tepaAgreementActive: true, programType: 'BOTH', nextVestingDate: null,
    });
    (computeVesting as jest.Mock).mockReturnValue({ totalTokens: 40, vestedTokens: 40, unvestedTokens: 0 });
    (listTokenLedgerEntries as jest.Mock).mockResolvedValue({ entries: [], balance: 100 });

    const result = await getTenantDashboard(TENANT_1);

    expect(result.rewardsPoints).toEqual({ balance: 0, earnedToDate: 0, earnedThisMonth: 0 });
    expect(result.equityCredits).toEqual({
      totalTokens: 100, vestedTokens: 60, unvestedTokens: 40,
      tokenValueUsd: 10, vestedValueUsd: 600, tepaAgreementActive: true,
    });
    // The two must never be the same object/values by coincidence of a shared source.
    expect(result.equityCredits).not.toEqual(result.rewardsPoints);
  });

  it('computes estimatedCreditValueChange from vested-token growth over the last 30 days', async () => {
    (getVestingSummary as jest.Mock).mockResolvedValue({
      totalTokens: 100, vestedTokens: 60, unvestedTokens: 40,
      tokenValueUsd: 10, totalValueUsd: 1000, vestedValueUsd: 600,
      monthlyAccrualTokens: 5, vestingMonths: 12, tokensEnabled: true,
      tepaAgreementActive: true, programType: 'BOTH', nextVestingDate: null,
    });
    (computeVesting as jest.Mock).mockReturnValue({ totalTokens: 40, vestedTokens: 40, unvestedTokens: 0 });
    (listTokenLedgerEntries as jest.Mock).mockResolvedValue({ entries: [], balance: 100 });

    const result = await getTenantDashboard(TENANT_1);

    // prior vested value = 40 * 10 = 400; current = 600 -> change = 200 (50%)
    expect(result.estimatedCreditValueChange).toEqual({ changeUsd: 200, changePercent: 50, periodDays: 30 });
  });

  it('computes pathwayToHomeownership as vested value over property valuation', async () => {
    (getVestingSummary as jest.Mock).mockResolvedValue({
      totalTokens: 100, vestedTokens: 60, unvestedTokens: 40,
      tokenValueUsd: 10, totalValueUsd: 1000, vestedValueUsd: 5000,
      monthlyAccrualTokens: 5, vestingMonths: 12, tokensEnabled: true,
      tepaAgreementActive: true, programType: 'BOTH', nextVestingDate: null,
    });
    (computeVesting as jest.Mock).mockReturnValue({ totalTokens: 0, vestedTokens: 0, unvestedTokens: 0 });
    (listTokenLedgerEntries as jest.Mock).mockResolvedValue({ entries: [], balance: 0 });

    const result = await getTenantDashboard(TENANT_1);

    expect(result.pathwayToHomeownership).toEqual({
      currentEquityValueUsd: 5000, propertyValueUsd: 500000, progressPercent: 1,
    });
  });

  it('surfaces documentsStatus from the Agreement model', async () => {
    (getVestingSummary as jest.Mock).mockResolvedValue({
      totalTokens: 0, vestedTokens: 0, unvestedTokens: 0, tokenValueUsd: 0, totalValueUsd: 0, vestedValueUsd: 0,
      monthlyAccrualTokens: 0, vestingMonths: 12, tokensEnabled: false, tepaAgreementActive: false, programType: 'RPA_ONLY', nextVestingDate: null,
    });
    (computeVesting as jest.Mock).mockReturnValue({ totalTokens: 0, vestedTokens: 0, unvestedTokens: 0 });
    (listTokenLedgerEntries as jest.Mock).mockResolvedValue({ entries: [], balance: 0 });
    (getTenantAgreements as jest.Mock).mockResolvedValue([
      { agreementType: 'LEASE', status: 'ACTIVE', signedAt: '2026-01-01T00:00:00.000Z', effectiveDate: '2026-01-01T00:00:00.000Z' },
      { agreementType: 'RPA', status: 'SIGNED', signedAt: '2026-02-01T00:00:00.000Z', effectiveDate: null },
    ]);

    const result = await getTenantDashboard(TENANT_1);

    expect(result.documentsStatus).toEqual([
      { agreementType: 'LEASE', status: 'ACTIVE', signedAt: '2026-01-01T00:00:00.000Z', effectiveDate: '2026-01-01T00:00:00.000Z' },
      { agreementType: 'RPA', status: 'SIGNED', signedAt: '2026-02-01T00:00:00.000Z', effectiveDate: null },
    ]);
  });

  it('returns null equity fields (not zeros disguised as data) when the tenant has no unit', async () => {
    (TenancyModel.findOne as jest.Mock).mockReturnValue(sortLeanExecChain(null));

    const result = await getTenantDashboard(TENANT_1);

    expect(result.equityCredits).toBeNull();
    expect(result.estimatedCreditValueChange).toBeNull();
    expect(result.pathwayToHomeownership).toBeNull();
    expect(getVestingSummary).not.toHaveBeenCalled();
  });
});

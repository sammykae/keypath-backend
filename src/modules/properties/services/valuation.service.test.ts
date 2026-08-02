import mongoose from 'mongoose';
import { recordValuation, listValuationHistory, getValuationStatus } from './valuation.service';
import { ValuationSnapshotModel } from '../models/valuationSnapshot.model';
import { PropertyModel } from '../models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { TokenLedgerEntryModel } from '../../ledger/models/tokenLedgerEntry.model';

const ORG_ID = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const LANDLORD_1 = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();

jest.mock('../models/valuationSnapshot.model', () => ({
  ValuationSnapshotModel: { create: jest.fn(), find: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../models/propertyModel', () => ({ PropertyModel: { findOne: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn() } }));
jest.mock('../../ledger/models/tokenLedgerEntry.model', () => ({
  TokenLedgerEntryModel: { create: jest.fn().mockResolvedValue(null) },
  TokenLedgerEntryType: { VALUATION_UPDATE: 'valuation_update' },
}));
jest.mock('../../audit/models/audit-log.model', () => ({ AuditEvent: { create: jest.fn().mockResolvedValue(null) } }));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function sortChain<T>(value: T) {
  return { sort: jest.fn().mockReturnValue(leanChain(value)) };
}

describe('recordValuation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the property is not in the org', async () => {
    (PropertyModel.findOne as jest.Mock).mockResolvedValue(null);
    await expect(
      recordValuation(LANDLORD_1, ORG_ID.toString(), PROPERTY_A.toString(), {
        valuationUsd: 500000,
        method: 'APPRAISAL',
        source: 'MANUAL',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('creates a snapshot, syncs Property.valuationUsd, and writes a VALUATION_UPDATE entry per active tenant', async () => {
    const propertyDoc: any = { _id: PROPERTY_A, valuationUsd: 400000, save: jest.fn().mockResolvedValue(null) };
    (PropertyModel.findOne as jest.Mock).mockResolvedValue(propertyDoc);
    (ValuationSnapshotModel.create as jest.Mock).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      propertyId: PROPERTY_A,
      valuationUsd: 500000,
      method: 'APPRAISAL',
      source: 'MANUAL',
      effectiveDate: new Date(),
      notes: null,
      createdAt: new Date(),
    });
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1 }]));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([{ tenantUserId: TENANT_1 }]));

    const result = await recordValuation(LANDLORD_1, ORG_ID.toString(), PROPERTY_A.toString(), {
      valuationUsd: 500000,
      method: 'APPRAISAL',
      source: 'MANUAL',
    });

    expect(propertyDoc.valuationUsd).toBe(500000);
    expect(propertyDoc.save).toHaveBeenCalled();
    expect(TokenLedgerEntryModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_1, type: 'valuation_update', tokens: 0, value: 500000 })
    );
    expect(result.valuationUsd).toBe(500000);
  });
});

describe('getValuationStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns NONE when no valuation has ever been recorded', async () => {
    (ValuationSnapshotModel.findOne as jest.Mock).mockReturnValue(sortChain(null));
    const result = await getValuationStatus(PROPERTY_A.toString());
    expect(result).toEqual({ status: 'NONE', latest: null, nextDueDate: null });
  });

  it('returns CURRENT for a valuation recorded recently', async () => {
    const recent = new Date();
    (ValuationSnapshotModel.findOne as jest.Mock).mockReturnValue(
      sortChain({ _id: new mongoose.Types.ObjectId(), propertyId: PROPERTY_A, valuationUsd: 1, method: 'APPRAISAL', source: 'MANUAL', effectiveDate: recent, notes: null, createdAt: recent })
    );
    const result = await getValuationStatus(PROPERTY_A.toString());
    expect(result.status).toBe('CURRENT');
  });

  it('returns OVERDUE for a valuation recorded more than a year ago', async () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    (ValuationSnapshotModel.findOne as jest.Mock).mockReturnValue(
      sortChain({ _id: new mongoose.Types.ObjectId(), propertyId: PROPERTY_A, valuationUsd: 1, method: 'APPRAISAL', source: 'MANUAL', effectiveDate: old, notes: null, createdAt: old })
    );
    const result = await getValuationStatus(PROPERTY_A.toString());
    expect(result.status).toBe('OVERDUE');
  });
});

describe('listValuationHistory', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the sorted valuation history for a property', async () => {
    const snap = { _id: new mongoose.Types.ObjectId(), propertyId: PROPERTY_A, valuationUsd: 1, method: 'APPRAISAL', source: 'MANUAL', effectiveDate: new Date(), notes: null, createdAt: new Date() };
    (ValuationSnapshotModel.find as jest.Mock).mockReturnValue(sortChain([snap]));

    const result = await listValuationHistory(PROPERTY_A.toString());

    expect(result).toHaveLength(1);
    expect(result[0].valuationUsd).toBe(1);
  });
});

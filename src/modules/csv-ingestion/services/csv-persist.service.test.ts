import mongoose from 'mongoose';
import { persistTenantRows } from './csv-persist.service';
import { CsvIngestionModel } from '../models/csv-ingestion.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { inviteTenant } from '../../landlord/services/landlordTenantActions.service';
import { storage } from '../../docs/storage';

const ORG_A = new mongoose.Types.ObjectId();
const ACTOR = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const UNIT_A = new mongoose.Types.ObjectId();

jest.mock('../../audit/services/audit.service', () => ({
  writeAuditEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('../models/csv-ingestion.model', () => ({
  CsvIngestionModel: { findById: jest.fn() },
}));

jest.mock('../../properties/models/propertyModel', () => ({
  PropertyModel: { findOne: jest.fn() },
}));

jest.mock('../../units/models/unit.model', () => ({
  UnitModel: { findOne: jest.fn() },
}));

jest.mock('../../landlord/services/landlordTenantActions.service', () => ({
  inviteTenant: jest.fn(),
}));

jest.mock('../../docs/storage', () => ({
  storage: { get: jest.fn() },
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function makeIngestionDoc(overrides: Record<string, any> = {}) {
  const doc: any = {
    _id: new mongoose.Types.ObjectId(),
    orgId: ORG_A,
    ingestionType: 'TENANT',
    status: 'COMPLETE',
    persistStatus: 'NOT_STARTED',
    s3Key: 'csv/test.csv',
    columnMapping: null,
    persistResults: [],
    tenantsCreated: 0,
    ...overrides,
  };
  doc.save = jest.fn().mockImplementation(async () => doc);
  return doc;
}

const CSV_HEADER = 'email,firstName,lastName,propertyRef,unitRef,monthlyRent,moveInDate';

describe('persistTenantRows', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects non-TENANT ingestion types', async () => {
    (CsvIngestionModel.findById as jest.Mock).mockResolvedValue(makeIngestionDoc({ ingestionType: 'PROPERTY' }));

    await expect(persistTenantRows('a'.repeat(24), ACTOR)).rejects.toMatchObject({ statusCode: 400 });
    expect(inviteTenant).not.toHaveBeenCalled();
  });

  it('rejects when the ingestion is not yet COMPLETE', async () => {
    (CsvIngestionModel.findById as jest.Mock).mockResolvedValue(makeIngestionDoc({ status: 'MAPPING_REQUIRED' }));

    await expect(persistTenantRows('a'.repeat(24), ACTOR)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates a tenancy for a fully valid row (resolves property + unit by name)', async () => {
    const csv = `${CSV_HEADER}\ntenant@test.com,Tina,Tenant,Maple St,1A,1500,2026-01-01`;
    (CsvIngestionModel.findById as jest.Mock).mockResolvedValue(makeIngestionDoc());
    (storage.get as jest.Mock).mockResolvedValue(Buffer.from(csv));
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A }));
    (UnitModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_A }));
    (inviteTenant as jest.Mock).mockResolvedValue({ inviteUrl: 'https://x' });

    const result = await persistTenantRows('a'.repeat(24), ACTOR);

    expect(inviteTenant).toHaveBeenCalledWith(ACTOR, expect.objectContaining({
      unitId: UNIT_A.toString(),
      email: 'tenant@test.com',
      rentAmount: 1500,
    }));
    expect(result.tenantsCreated).toBe(1);
    expect(result.persistStatus).toBe('PERSISTED');
    expect(result.persistResults[0].status).toBe('CREATED');

    // Property/unit lookups are org-scoped
    expect((PropertyModel.findOne as jest.Mock).mock.calls[0][0].orgId).toBe(ORG_A);
  });

  it('skips a row missing propertyRef/unitRef instead of erroring', async () => {
    const csv = `${CSV_HEADER}\ntenant@test.com,Tina,Tenant,,,1500,2026-01-01`;
    (CsvIngestionModel.findById as jest.Mock).mockResolvedValue(makeIngestionDoc());
    (storage.get as jest.Mock).mockResolvedValue(Buffer.from(csv));

    const result = await persistTenantRows('a'.repeat(24), ACTOR);

    expect(inviteTenant).not.toHaveBeenCalled();
    expect(result.persistResults[0].status).toBe('SKIPPED');
    expect(result.tenantsCreated).toBe(0);
  });

  it('reports an ERROR when the property cannot be found', async () => {
    const csv = `${CSV_HEADER}\ntenant@test.com,Tina,Tenant,Nonexistent Ave,1A,1500,2026-01-01`;
    (CsvIngestionModel.findById as jest.Mock).mockResolvedValue(makeIngestionDoc());
    (storage.get as jest.Mock).mockResolvedValue(Buffer.from(csv));
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));

    const result = await persistTenantRows('a'.repeat(24), ACTOR);

    expect(result.persistResults[0]).toMatchObject({ status: 'ERROR' });
    expect(result.persistResults[0].message).toMatch(/not found/i);
  });

  it('surfaces inviteTenant failures (e.g. unit already occupied) as a row ERROR without throwing', async () => {
    const csv = `${CSV_HEADER}\ntenant@test.com,Tina,Tenant,Maple St,1A,1500,2026-01-01`;
    (CsvIngestionModel.findById as jest.Mock).mockResolvedValue(makeIngestionDoc());
    (storage.get as jest.Mock).mockResolvedValue(Buffer.from(csv));
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A }));
    (UnitModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_A }));

    const { AppError } = jest.requireActual('../../../core/errors/AppError');
    (inviteTenant as jest.Mock).mockRejectedValue(new AppError('Unit already has an active or pending tenant', 409));

    const result = await persistTenantRows('a'.repeat(24), ACTOR);

    expect(result.persistResults[0]).toMatchObject({
      status: 'ERROR',
      message: 'Unit already has an active or pending tenant',
    });
    expect(result.tenantsCreated).toBe(0);
  });

  it('treats duplicate emails within the same file as an error on the second occurrence', async () => {
    const csv = [
      CSV_HEADER,
      'dup@test.com,A,One,Maple St,1A,1500,2026-01-01',
      'dup@test.com,B,Two,Maple St,1B,1600,2026-01-01',
    ].join('\n');
    (CsvIngestionModel.findById as jest.Mock).mockResolvedValue(makeIngestionDoc());
    (storage.get as jest.Mock).mockResolvedValue(Buffer.from(csv));
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A }));
    (UnitModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_A }));
    (inviteTenant as jest.Mock).mockResolvedValue({});

    const result = await persistTenantRows('a'.repeat(24), ACTOR);

    expect(inviteTenant).toHaveBeenCalledTimes(1);
    expect(result.persistResults[1]).toMatchObject({ status: 'ERROR', message: 'Duplicate email within this file' });
  });
});

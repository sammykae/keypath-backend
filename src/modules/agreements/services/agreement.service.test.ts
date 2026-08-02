import mongoose from 'mongoose';
import {
  getTenantAgreements,
  getAgreementForTenant,
  uploadSignedAgreement,
  updateAgreementStatus,
  listAgreementsForLandlord,
  isTepaAgreementActive,
} from './agreement.service';
import { AgreementModel } from '../models/agreement.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User } from '../../auth/models/user.model';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import { notify } from '../../notifications/services/notification.service';
import { AuditEvent } from '../../audit/models/audit-log.model';

const ORG_ID_STR = '507f1f77bcf86cd7994390aa';
const ORG_ID = new mongoose.Types.ObjectId(ORG_ID_STR);
const PROPERTY_A = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();
const LANDLORD_1 = new mongoose.Types.ObjectId();
const TENANCY_1 = new mongoose.Types.ObjectId();

jest.mock('../models/agreement.model', () => {
  const actual = jest.requireActual('../models/agreement.model');
  return { ...actual, AgreementModel: { create: jest.fn(), findOne: jest.fn(), find: jest.fn() } };
});
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { findById: jest.fn(), findOne: jest.fn(), exists: jest.fn(), find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { findById: jest.fn(), find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { findOne: jest.fn() } }));
jest.mock('../../auth/models/user.model', () => ({ User: { find: jest.fn() } }));
jest.mock('../../audit/models/audit-log.model', () => ({ AuditEvent: { create: jest.fn().mockResolvedValue(null) } }));
jest.mock('../../notifications/services/notification.service', () => ({ notify: jest.fn() }));
jest.mock('../../landlord/services/landlordDashboard.service', () => ({
  resolveLandlordOrgId: jest.fn().mockResolvedValue('507f1f77bcf86cd7994390aa'),
}));
jest.mock('../../docs/storage', () => ({
  S3Storage: jest.fn().mockImplementation(() => ({ getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/file') })),
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}
function sortChain<T>(value: T) {
  return { sort: jest.fn().mockReturnValue(leanChain(value)) };
}

function makeAgreement(overrides: Record<string, any> = {}) {
  const doc: any = {
    _id: new mongoose.Types.ObjectId(),
    orgId: ORG_ID,
    propertyId: PROPERTY_A,
    unitId: UNIT_1,
    tenantUserId: TENANT_1,
    tenancyId: TENANCY_1,
    agreementType: 'TEPA',
    status: 'NOT_STARTED',
    document: null,
    sentAt: null,
    viewedAt: null,
    signedAt: null,
    effectiveDate: null,
    terminatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  doc.save = jest.fn().mockImplementation(async () => doc);
  return doc;
}

describe('getTenantAgreements', () => {
  beforeEach(() => jest.clearAllMocks());

  it('includes LEASE and RPA for an RPA_ONLY participation model, and lazily creates missing rows', async () => {
    (TenancyModel.findOne as jest.Mock).mockReturnValue(sortChain({ _id: TENANCY_1, unitId: UNIT_1 }));
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_1, propertyId: PROPERTY_A }));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID, participationModel: 'RPA_ONLY' }));
    (AgreementModel.findOne as jest.Mock).mockResolvedValue(null);
    (AgreementModel.create as jest.Mock).mockImplementation((doc: any) => Promise.resolve(makeAgreement(doc)));

    const result = await getTenantAgreements(TENANT_1);

    expect(result.map((r) => r.agreementType).sort()).toEqual(['LEASE', 'RPA']);
    expect(AgreementModel.create).toHaveBeenCalledTimes(2);
  });

  it('includes TEPA for a BOTH participation model', async () => {
    (TenancyModel.findOne as jest.Mock).mockReturnValue(sortChain({ _id: TENANCY_1, unitId: UNIT_1 }));
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_1, propertyId: PROPERTY_A }));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID, participationModel: 'BOTH' }));
    (AgreementModel.findOne as jest.Mock).mockResolvedValue(null);
    (AgreementModel.create as jest.Mock).mockImplementation((doc: any) => Promise.resolve(makeAgreement(doc)));

    const result = await getTenantAgreements(TENANT_1);

    expect(result.map((r) => r.agreementType).sort()).toEqual(['LEASE', 'RPA', 'TEPA']);
  });

  it('reports a SIGNED agreement as ACTIVE once its effectiveDate has passed', async () => {
    (TenancyModel.findOne as jest.Mock).mockReturnValue(sortChain({ _id: TENANCY_1, unitId: UNIT_1 }));
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: UNIT_1, propertyId: PROPERTY_A }));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID, participationModel: 'NONE' }));
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    (AgreementModel.findOne as jest.Mock).mockResolvedValue(
      makeAgreement({ agreementType: 'LEASE', status: 'SIGNED', effectiveDate: past })
    );

    const result = await getTenantAgreements(TENANT_1);

    expect(result[0].status).toBe('ACTIVE');
  });
});

describe('getAgreementForTenant', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the agreement does not belong to this tenant', async () => {
    (AgreementModel.findOne as jest.Mock).mockResolvedValue(null);
    await expect(getAgreementForTenant(TENANT_1, new mongoose.Types.ObjectId().toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('transitions SENT to VIEWED and records viewedAt', async () => {
    const doc = makeAgreement({ status: 'SENT' });
    (AgreementModel.findOne as jest.Mock).mockResolvedValue(doc);

    const result = await getAgreementForTenant(TENANT_1, doc._id.toString());

    expect(doc.status).toBe('VIEWED');
    expect(doc.viewedAt).toBeInstanceOf(Date);
    expect(result.status).toBe('VIEWED');
  });
});

describe('uploadSignedAgreement', () => {
  beforeEach(() => jest.clearAllMocks());

  const INPUT = {
    tenantUserId: TENANT_1.toString(),
    propertyId: PROPERTY_A.toString(),
    unitId: UNIT_1.toString(),
    agreementType: 'TEPA' as const,
    document: { fileKey: 'agreements/a.pdf', fileName: 'a.pdf', fileType: 'application/pdf' },
  };

  it('rejects when the property is not in the org', async () => {
    (PropertyModel.exists as jest.Mock).mockResolvedValue(null);
    await expect(uploadSignedAgreement(LANDLORD_1, ORG_ID.toString(), INPUT)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects when the tenant has no tenancy on the unit', async () => {
    (PropertyModel.exists as jest.Mock).mockResolvedValue(true);
    (TenancyModel.findOne as jest.Mock).mockReturnValue(sortChain(null));
    await expect(uploadSignedAgreement(LANDLORD_1, ORG_ID.toString(), INPUT)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('creates a new agreement, reported ACTIVE since no future effectiveDate was given', async () => {
    (PropertyModel.exists as jest.Mock).mockResolvedValue(true);
    (TenancyModel.findOne as jest.Mock).mockReturnValue(sortChain({ _id: TENANCY_1 }));
    (AgreementModel.findOne as jest.Mock).mockResolvedValue(null);
    (AgreementModel.create as jest.Mock).mockImplementation((doc: any) => Promise.resolve(makeAgreement(doc)));

    const result = await uploadSignedAgreement(LANDLORD_1, ORG_ID.toString(), INPUT);

    expect(result.status).toBe('ACTIVE');
    expect(result.document?.fileKey).toBe('agreements/a.pdf');
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'TEPA_SIGNED', recipientId: TENANT_1 }));
    expect(AuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AGREEMENT_UPLOADED',
        diff: { before: { status: null }, after: { status: 'SIGNED' } },
      })
    );
  });

  it('does not notify for a LEASE agreement (only RPA/TEPA are wired)', async () => {
    (PropertyModel.exists as jest.Mock).mockResolvedValue(true);
    (TenancyModel.findOne as jest.Mock).mockReturnValue(sortChain({ _id: TENANCY_1 }));
    (AgreementModel.findOne as jest.Mock).mockResolvedValue(null);
    (AgreementModel.create as jest.Mock).mockImplementation((doc: any) => Promise.resolve(makeAgreement(doc)));

    await uploadSignedAgreement(LANDLORD_1, ORG_ID.toString(), { ...INPUT, agreementType: 'LEASE' });

    expect(notify).not.toHaveBeenCalled();
  });

  it('stays SIGNED (not yet ACTIVE) when the effective date is in the future', async () => {
    (PropertyModel.exists as jest.Mock).mockResolvedValue(true);
    (TenancyModel.findOne as jest.Mock).mockReturnValue(sortChain({ _id: TENANCY_1 }));
    (AgreementModel.findOne as jest.Mock).mockResolvedValue(null);
    (AgreementModel.create as jest.Mock).mockImplementation((doc: any) => Promise.resolve(makeAgreement(doc)));
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await uploadSignedAgreement(LANDLORD_1, ORG_ID.toString(), { ...INPUT, effectiveDate: future });

    expect(result.status).toBe('SIGNED');
  });

  it('updates an existing agreement in place', async () => {
    (PropertyModel.exists as jest.Mock).mockResolvedValue(true);
    (TenancyModel.findOne as jest.Mock).mockReturnValue(sortChain({ _id: TENANCY_1 }));
    const existing = makeAgreement({ status: 'NOT_STARTED' });
    (AgreementModel.findOne as jest.Mock).mockResolvedValue(existing);

    await uploadSignedAgreement(LANDLORD_1, ORG_ID.toString(), INPUT);

    expect(AgreementModel.create).not.toHaveBeenCalled();
    expect(existing.status).toBe('SIGNED');
    expect(existing.document).toEqual(INPUT.document);
    expect(AuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AGREEMENT_UPLOADED',
        diff: { before: { status: 'NOT_STARTED' }, after: { status: 'SIGNED' } },
      })
    );
  });
});

describe('updateAgreementStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the agreement is not found in the org', async () => {
    (AgreementModel.findOne as jest.Mock).mockResolvedValue(null);
    await expect(
      updateAgreementStatus(LANDLORD_1, ORG_ID.toString(), new mongoose.Types.ObjectId().toString(), { status: 'SENT' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('transitions to TERMINATED and records terminatedAt', async () => {
    const doc = makeAgreement({ status: 'ACTIVE' });
    (AgreementModel.findOne as jest.Mock).mockResolvedValue(doc);

    const result = await updateAgreementStatus(LANDLORD_1, ORG_ID.toString(), doc._id.toString(), { status: 'TERMINATED' });

    expect(doc.terminatedAt).toBeInstanceOf(Date);
    expect(result.status).toBe('TERMINATED');
  });
});

describe('listAgreementsForLandlord', () => {
  beforeEach(() => jest.clearAllMocks());

  it('joins tenant/property/unit info onto each agreement row', async () => {
    const row = makeAgreement({ agreementType: 'RPA', status: 'SIGNED' });
    (AgreementModel.find as jest.Mock).mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([row]) }) });
    (User.find as jest.Mock).mockReturnValue(leanChain([{ _id: TENANT_1, email: 'tenant@test.com', profile: { firstName: 'Tina', lastName: 'Tenant' } }]));
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: PROPERTY_A, name: 'Maple St' }]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, unitNumber: '1A' }]));

    const result = await listAgreementsForLandlord(LANDLORD_1);

    expect(resolveLandlordOrgId).toHaveBeenCalledWith(LANDLORD_1);
    expect(result[0]).toMatchObject({ tenantName: 'Tina Tenant', propertyName: 'Maple St', unitNumber: '1A' });
  });
});

describe('isTepaAgreementActive', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns false when no TEPA agreement exists', async () => {
    (AgreementModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    const result = await isTepaAgreementActive(TENANT_1, UNIT_1);
    expect(result).toBe(false);
  });

  it('returns false when the TEPA agreement is only SIGNED with a future effective date', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    (AgreementModel.findOne as jest.Mock).mockReturnValue(leanChain({ status: 'SIGNED', effectiveDate: future }));
    const result = await isTepaAgreementActive(TENANT_1, UNIT_1);
    expect(result).toBe(false);
  });

  it('returns true when the TEPA agreement is SIGNED with a past effective date', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    (AgreementModel.findOne as jest.Mock).mockReturnValue(leanChain({ status: 'SIGNED', effectiveDate: past }));
    const result = await isTepaAgreementActive(TENANT_1, UNIT_1);
    expect(result).toBe(true);
  });
});

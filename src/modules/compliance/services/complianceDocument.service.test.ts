import mongoose from 'mongoose';
import {
  listComplianceForProperty,
  uploadComplianceDocument,
  updateComplianceStatus,
  getComplianceAggregation,
  getComplianceDocumentFile,
} from './complianceDocument.service';
import { ComplianceDocumentModel } from '../models/complianceDocument.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User } from '../../auth/models/user.model';
import { AuditEvent } from '../../audit/models/audit-log.model';

const ORG_ID_STR = '507f1f77bcf86cd7994390aa';
const ORG_ID = new mongoose.Types.ObjectId(ORG_ID_STR);
const PROPERTY_A = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();
const LANDLORD_1 = new mongoose.Types.ObjectId();

jest.mock('../models/complianceDocument.model', () => {
  const actual = jest.requireActual('../models/complianceDocument.model');
  return { ...actual, ComplianceDocumentModel: { create: jest.fn(), findOne: jest.fn(), find: jest.fn() } };
});
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { findOne: jest.fn(), findById: jest.fn(), find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn() } }));
jest.mock('../../auth/models/user.model', () => ({ User: { find: jest.fn(), findById: jest.fn() } }));
jest.mock('../../audit/models/audit-log.model', () => ({ AuditEvent: { create: jest.fn().mockResolvedValue(null) } }));
jest.mock('../../landlord/services/landlordDashboard.service', () => ({
  resolveLandlordOrgId: jest.fn().mockResolvedValue('507f1f77bcf86cd7994390aa'),
}));
jest.mock('../../docs/storage', () => ({
  S3Storage: jest.fn().mockImplementation(() => ({ getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/file') })),
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function makeDoc(overrides: Record<string, any> = {}) {
  const doc: any = {
    _id: new mongoose.Types.ObjectId(),
    orgId: ORG_ID,
    propertyId: PROPERTY_A,
    tenantId: null,
    documentType: 'PROPERTY_INSURANCE',
    status: 'MISSING',
    document: null,
    uploadedAt: null,
    uploadedBy: null,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  doc.save = jest.fn().mockImplementation(async () => doc);
  return doc;
}

describe('listComplianceForProperty', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the property is not in the org', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    await expect(listComplianceForProperty(ORG_ID_STR, PROPERTY_A.toString())).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lazily creates a MISSING row for all 7 property-level types plus 3 per active tenant', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID, name: 'Maple St' }));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1 }]));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([{ tenantUserId: TENANT_1 }]));
    (ComplianceDocumentModel.findOne as jest.Mock).mockResolvedValue(null);
    (ComplianceDocumentModel.create as jest.Mock).mockImplementation((doc: any) => Promise.resolve(makeDoc(doc)));
    (User.find as jest.Mock).mockReturnValue(leanChain([{ _id: TENANT_1, email: 'tenant@test.com', profile: {} }]));

    const result = await listComplianceForProperty(ORG_ID_STR, PROPERTY_A.toString());

    // 7 property-wide + 3 tenant-scoped for the one active tenant = 10
    expect(result).toHaveLength(10);
    expect(ComplianceDocumentModel.create).toHaveBeenCalledTimes(10);
    const types = result.map((r) => r.documentType).sort();
    expect(types).toContain('LEASE_AGREEMENT');
    expect(types).toContain('PROPERTY_INSURANCE');
  });

  it('reports an APPROVED document as EXPIRED once its expiresAt has passed', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID, name: 'Maple St' }));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([]));
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    (ComplianceDocumentModel.findOne as jest.Mock).mockResolvedValue(
      makeDoc({ documentType: 'PROPERTY_INSURANCE', status: 'APPROVED', expiresAt: past })
    );

    const result = await listComplianceForProperty(ORG_ID_STR, PROPERTY_A.toString());

    const insurance = result.find((r) => r.documentType === 'PROPERTY_INSURANCE');
    expect(insurance?.status).toBe('EXPIRED');
  });
});

describe('uploadComplianceDocument', () => {
  beforeEach(() => jest.clearAllMocks());

  const FILE = { fileKey: 'compliance/a.pdf', fileName: 'a.pdf', fileType: 'application/pdf' };

  it('rejects a tenant-scoped type without a tenantId', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID, name: 'Maple St' }));
    await expect(
      uploadComplianceDocument(LANDLORD_1, ORG_ID_STR, {
        propertyId: PROPERTY_A.toString(), documentType: 'LEASE_AGREEMENT', document: FILE,
      } as any)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when the property is not in the org', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    await expect(
      uploadComplianceDocument(LANDLORD_1, ORG_ID_STR, {
        propertyId: PROPERTY_A.toString(), documentType: 'PROPERTY_INSURANCE', document: FILE,
      } as any)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('creates a new record and sets status UPLOADED', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID, name: 'Maple St' }));
    (ComplianceDocumentModel.findOne as jest.Mock).mockResolvedValue(null);
    (ComplianceDocumentModel.create as jest.Mock).mockImplementation((doc: any) => Promise.resolve(makeDoc(doc)));

    const result = await uploadComplianceDocument(LANDLORD_1, ORG_ID_STR, {
      propertyId: PROPERTY_A.toString(), documentType: 'PROPERTY_INSURANCE', document: FILE,
    } as any);

    expect(result.status).toBe('UPLOADED');
    expect(result.document?.fileKey).toBe('compliance/a.pdf');
  });

  it('re-uploading clears a prior rejection reason', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID, name: 'Maple St' }));
    const existing = makeDoc({ status: 'REJECTED', rejectionReason: 'blurry scan' });
    (ComplianceDocumentModel.findOne as jest.Mock).mockResolvedValue(existing);

    const result = await uploadComplianceDocument(LANDLORD_1, ORG_ID_STR, {
      propertyId: PROPERTY_A.toString(), documentType: 'PROPERTY_INSURANCE', document: FILE,
    } as any);

    expect(result.status).toBe('UPLOADED');
    expect(result.rejectionReason).toBeNull();
  });

  it('writes a distinct DEBT_DOCUMENT_UPLOADED action for a MORTGAGE_DEBT_DOCUMENT upload', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID, name: 'Maple St' }));
    (ComplianceDocumentModel.findOne as jest.Mock).mockResolvedValue(null);
    (ComplianceDocumentModel.create as jest.Mock).mockImplementation((doc: any) => Promise.resolve(makeDoc(doc)));

    await uploadComplianceDocument(LANDLORD_1, ORG_ID_STR, {
      propertyId: PROPERTY_A.toString(), documentType: 'MORTGAGE_DEBT_DOCUMENT', document: FILE,
    } as any);

    expect(AuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEBT_DOCUMENT_UPLOADED', metadata: { documentType: 'MORTGAGE_DEBT_DOCUMENT' } })
    );
  });

  it('writes the generic COMPLIANCE_DOCUMENT_UPLOADED action for other document types', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID, name: 'Maple St' }));
    (ComplianceDocumentModel.findOne as jest.Mock).mockResolvedValue(null);
    (ComplianceDocumentModel.create as jest.Mock).mockImplementation((doc: any) => Promise.resolve(makeDoc(doc)));

    await uploadComplianceDocument(LANDLORD_1, ORG_ID_STR, {
      propertyId: PROPERTY_A.toString(), documentType: 'PROPERTY_INSURANCE', document: FILE,
    } as any);

    expect(AuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMPLIANCE_DOCUMENT_UPLOADED' })
    );
  });
});

describe('updateComplianceStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the document is not found in the org', async () => {
    (ComplianceDocumentModel.findOne as jest.Mock).mockResolvedValue(null);
    await expect(
      updateComplianceStatus(LANDLORD_1, ORG_ID_STR, new mongoose.Types.ObjectId().toString(), { status: 'APPROVED' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects REJECTED without a rejectionReason', async () => {
    (ComplianceDocumentModel.findOne as jest.Mock).mockResolvedValue(makeDoc({ status: 'UPLOADED' }));
    await expect(
      updateComplianceStatus(LANDLORD_1, ORG_ID_STR, new mongoose.Types.ObjectId().toString(), { status: 'REJECTED' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('APPROVED records the reviewer and clears any rejection reason', async () => {
    const doc = makeDoc({ status: 'PENDING_REVIEW' });
    (ComplianceDocumentModel.findOne as jest.Mock).mockResolvedValue(doc);
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple St' }));

    const result = await updateComplianceStatus(LANDLORD_1, ORG_ID_STR, doc._id.toString(), { status: 'APPROVED' });

    expect(doc.reviewedBy).toBe(LANDLORD_1);
    expect(result.status).toBe('APPROVED');
    expect(AuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMPLIANCE_DOCUMENT_APPROVED',
        diff: { before: { status: 'PENDING_REVIEW' }, after: { status: 'APPROVED' } },
      })
    );
  });

  it('REJECTED records the reason', async () => {
    const doc = makeDoc({ status: 'PENDING_REVIEW' });
    (ComplianceDocumentModel.findOne as jest.Mock).mockResolvedValue(doc);
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple St' }));

    const result = await updateComplianceStatus(LANDLORD_1, ORG_ID_STR, doc._id.toString(), {
      status: 'REJECTED', rejectionReason: 'Expired policy',
    });

    expect(result.status).toBe('REJECTED');
    expect(result.rejectionReason).toBe('Expired policy');
    expect(AuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMPLIANCE_DOCUMENT_REJECTED',
        metadata: { rejectionReason: 'Expired policy' },
        diff: { before: { status: 'PENDING_REVIEW' }, after: { status: 'REJECTED' } },
      })
    );
  });
});

describe('getComplianceAggregation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts documents by status', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A, orgId: ORG_ID, name: 'Maple St' }));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([]));
    (ComplianceDocumentModel.findOne as jest.Mock)
      .mockResolvedValueOnce(makeDoc({ documentType: 'LEASE_AGREEMENT', status: 'APPROVED' }))
      .mockResolvedValue(makeDoc({ status: 'MISSING' }));

    const result = await getComplianceAggregation(LANDLORD_1, PROPERTY_A.toString());

    expect(result.totalDocuments).toBe(7);
    expect(result.byStatus.APPROVED + result.byStatus.MISSING).toBe(7);
  });
});

describe('getComplianceDocumentFile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when no document has been uploaded yet', async () => {
    (ComplianceDocumentModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    await expect(getComplianceDocumentFile(LANDLORD_1, new mongoose.Types.ObjectId().toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns a signed URL when a document exists', async () => {
    (ComplianceDocumentModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ document: { fileKey: 'compliance/a.pdf', fileName: 'a.pdf', fileType: 'application/pdf' } })
    );
    const result = await getComplianceDocumentFile(LANDLORD_1, new mongoose.Types.ObjectId().toString());
    expect(result.fileName).toBe('a.pdf');
  });
});

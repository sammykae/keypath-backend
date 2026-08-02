import mongoose from 'mongoose';
import { createNote, listNotes, updateNote } from './notes.service';
import { PropertyNoteModel } from '../models/propertyNote.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { AppError } from '../../../core/errors/AppError';

const ORG_A = '507f1f77bcf86cd7994390aa';
const USER_A = '507f1f77bcf86cd799439001';
const PROPERTY_A = '507f1f77bcf86cd799439011';
const PROPERTY_OTHER_ORG = '507f1f77bcf86cd799439099';

jest.mock('../../landlord/services/landlordDashboard.service', () => ({
  resolveLandlordOrgId: jest.fn().mockResolvedValue('507f1f77bcf86cd7994390aa'),
}));

jest.mock('../../audit/models/audit-log.model', () => ({
  AuditEvent: { create: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../models/propertyNote.model', () => ({
  PropertyNoteModel: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('../../properties/models/propertyModel', () => ({
  PropertyModel: { findOne: jest.fn() },
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

const baseNoteDoc = {
  _id: new mongoose.Types.ObjectId(),
  propertyId: new mongoose.Types.ObjectId(PROPERTY_A),
  unitId: null,
  tenantId: null,
  createdBy: new mongoose.Types.ObjectId(USER_A),
  createdByRole: 'landlord',
  noteType: 'RENEWAL',
  noteText: 'tenant may renew',
  attachments: [],
  visibility: 'LANDLORD_AND_PM',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('notes.service RBAC / org isolation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('createNote rejects a property that is not in the caller org (403)', async () => {
    // Property lookup is org-filtered — a foreign property yields null
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain(null));

    await expect(
      createNote(new mongoose.Types.ObjectId(USER_A), 'landlord', {
        propertyId: PROPERTY_OTHER_ORG,
        noteType: 'PROPERTY',
        noteText: 'should not be created',
        attachments: [],
        visibility: 'LANDLORD_AND_PM',
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(PropertyNoteModel.create).not.toHaveBeenCalled();
    // The lookup itself must be scoped to the caller's org
    expect((PropertyModel.findOne as jest.Mock).mock.calls[0][0].orgId.toString()).toBe(ORG_A);
  });

  it('createNote stamps the caller org on the note', async () => {
    (PropertyModel.findOne as jest.Mock).mockReturnValue(leanChain({ _id: PROPERTY_A }));
    (PropertyNoteModel.create as jest.Mock).mockResolvedValue(baseNoteDoc);

    await createNote(new mongoose.Types.ObjectId(USER_A), 'landlord', {
      propertyId: PROPERTY_A,
      noteType: 'RENEWAL',
      noteText: 'tenant may renew',
      attachments: [],
      visibility: 'LANDLORD_AND_PM',
    });

    const created = (PropertyNoteModel.create as jest.Mock).mock.calls[0][0];
    expect(created.orgId.toString()).toBe(ORG_A);
  });

  it('listNotes always filters by the caller org', async () => {
    (PropertyNoteModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue(leanChain([baseNoteDoc])),
      }),
    });

    await listNotes(new mongoose.Types.ObjectId(USER_A), { limit: 25 });

    const filter = (PropertyNoteModel.find as jest.Mock).mock.calls[0][0];
    expect(filter.orgId.toString()).toBe(ORG_A);
  });

  it('updateNote cannot touch a note from another org (404)', async () => {
    // Org-scoped findOne returns null for a foreign note
    (PropertyNoteModel.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      updateNote(new mongoose.Types.ObjectId(USER_A), baseNoteDoc._id.toString(), {
        noteText: 'hijack attempt',
      })
    ).rejects.toMatchObject({ statusCode: 404 });

    const filter = (PropertyNoteModel.findOne as jest.Mock).mock.calls[0][0];
    expect(filter.orgId.toString()).toBe(ORG_A);
  });

  it('rejects an invalid note id early', async () => {
    await expect(
      updateNote(new mongoose.Types.ObjectId(USER_A), 'not-an-id', { noteText: 'x' })
    ).rejects.toBeInstanceOf(AppError);
  });
});

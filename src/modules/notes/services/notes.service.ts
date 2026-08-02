import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { PropertyNoteModel, IPropertyNote, NoteCreatedByRole } from '../models/propertyNote.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { AuditEvent } from '../../audit/models/audit-log.model';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import { CreateNoteInput, UpdateNoteInput, ListNotesQuery } from '../dto/note.dto';

export interface NoteDTO {
  id: string;
  propertyId: string;
  unitId: string | null;
  tenantId: string | null;
  createdBy: string;
  createdByRole: string;
  noteType: string;
  noteText: string;
  attachments: { fileKey: string; fileName: string; fileType: string }[];
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

function toDTO(n: any): NoteDTO {
  return {
    id: n._id.toString(),
    propertyId: n.propertyId.toString(),
    unitId: n.unitId?.toString() ?? null,
    tenantId: n.tenantId?.toString() ?? null,
    createdBy: n.createdBy.toString(),
    createdByRole: n.createdByRole,
    noteType: n.noteType,
    noteText: n.noteText,
    attachments: (n.attachments ?? []).map((a: any) => ({
      fileKey: a.fileKey, fileName: a.fileName, fileType: a.fileType,
    })),
    visibility: n.visibility,
    createdAt: new Date(n.createdAt).toISOString(),
    updatedAt: new Date(n.updatedAt).toISOString(),
  };
}

async function assertPropertyInOrg(propertyId: string, orgOid: mongoose.Types.ObjectId) {
  const property = await PropertyModel.findOne({
    _id: new mongoose.Types.ObjectId(propertyId),
    orgId: orgOid,
  }).lean();
  if (!property) throw new AppError('Property not found in your organization', 403);
}

export async function createNote(
  userId: mongoose.Types.ObjectId,
  role: NoteCreatedByRole,
  input: CreateNoteInput
): Promise<NoteDTO> {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);
  await assertPropertyInOrg(input.propertyId, orgOid);

  const note = await PropertyNoteModel.create({
    orgId: orgOid,
    propertyId: new mongoose.Types.ObjectId(input.propertyId),
    unitId: input.unitId ? new mongoose.Types.ObjectId(input.unitId) : null,
    tenantId: input.tenantId ? new mongoose.Types.ObjectId(input.tenantId) : null,
    createdBy: userId,
    createdByRole: role,
    noteType: input.noteType,
    noteText: input.noteText,
    attachments: input.attachments,
    visibility: input.visibility,
  });

  AuditEvent.create({
    actorUserId: userId,
    orgId: orgOid,
    action: 'NOTE_CREATED',
    entityType: 'propertyNote',
    entityId: note._id,
    source: 'user',
    updateType: 'manual',
    propertyId: note.propertyId,
    tenantId: note.tenantId ?? null,
    diff: { before: null, after: { noteType: note.noteType, visibility: note.visibility } },
  }).catch(() => {});

  return toDTO(note);
}

export async function listNotes(
  userId: mongoose.Types.ObjectId,
  query: ListNotesQuery
): Promise<{ notes: NoteDTO[]; nextCursor: string | null }> {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const filter: any = { orgId: orgOid };
  if (query.propertyId) filter.propertyId = new mongoose.Types.ObjectId(query.propertyId);
  if (query.tenantId) filter.tenantId = new mongoose.Types.ObjectId(query.tenantId);
  if (query.noteType) filter.noteType = query.noteType;
  if (query.cursor) filter._id = { $lt: new mongoose.Types.ObjectId(query.cursor) };

  const rows = await PropertyNoteModel.find(filter)
    .sort({ _id: -1 })
    .limit(query.limit + 1)
    .lean();

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const nextCursor = hasMore && page.length ? (page[page.length - 1] as any)._id.toString() : null;

  return { notes: page.map(toDTO), nextCursor };
}

async function findOwnedNote(userId: mongoose.Types.ObjectId, noteId: string): Promise<IPropertyNote> {
  if (!mongoose.Types.ObjectId.isValid(noteId)) throw new AppError('Invalid note id', 400);
  const orgId = await resolveLandlordOrgId(userId);
  const note = await PropertyNoteModel.findOne({
    _id: new mongoose.Types.ObjectId(noteId),
    orgId: new mongoose.Types.ObjectId(orgId),
  });
  if (!note) throw new AppError('Note not found', 404);
  return note;
}

export async function updateNote(
  userId: mongoose.Types.ObjectId,
  noteId: string,
  input: UpdateNoteInput
): Promise<NoteDTO> {
  const note = await findOwnedNote(userId, noteId);
  const before = { noteType: note.noteType, noteText: note.noteText, visibility: note.visibility };

  if (input.noteType) note.noteType = input.noteType;
  if (input.noteText) note.noteText = input.noteText;
  if (input.visibility) note.visibility = input.visibility;
  await note.save();

  AuditEvent.create({
    actorUserId: userId,
    orgId: note.orgId,
    action: 'NOTE_UPDATED',
    entityType: 'propertyNote',
    entityId: note._id,
    source: 'user',
    updateType: 'manual',
    propertyId: note.propertyId,
    tenantId: note.tenantId ?? null,
    diff: { before, after: { noteType: note.noteType, noteText: note.noteText, visibility: note.visibility } },
  }).catch(() => {});

  return toDTO(note);
}

export async function deleteNote(userId: mongoose.Types.ObjectId, noteId: string): Promise<void> {
  const note = await findOwnedNote(userId, noteId);
  await note.deleteOne();

  AuditEvent.create({
    actorUserId: userId,
    orgId: note.orgId,
    action: 'NOTE_DELETED',
    entityType: 'propertyNote',
    entityId: note._id,
    source: 'user',
    updateType: 'manual',
    propertyId: note.propertyId,
    tenantId: note.tenantId ?? null,
    diff: { before: { noteType: note.noteType, noteText: note.noteText }, after: null },
  }).catch(() => {});
}

/* -------------------------------------------------------------------------------------- */
/*  Property Manager access — scoped by property assignment, NOT resolveLandlordOrgId      */
/*  (a PM's org membership is roleInOrg=MEMBER, which resolveLandlordOrgId does not resolve) */
/* -------------------------------------------------------------------------------------- */

/**
 * PM-facing note list for one property. Caller must have already verified
 * hasPMAccess(pmUserId, propertyId). Only LANDLORD_AND_PM notes are visible —
 * LANDLORD_ONLY notes are never returned to a property manager.
 */
export async function listNotesForPropertyManager(
  propertyId: string,
  orgId: mongoose.Types.ObjectId
): Promise<NoteDTO[]> {
  const notes = await PropertyNoteModel.find({
    orgId,
    propertyId: new mongoose.Types.ObjectId(propertyId),
    visibility: 'LANDLORD_AND_PM',
  })
    .sort({ _id: -1 })
    .limit(100)
    .lean();
  return notes.map(toDTO);
}

/**
 * PM-authored note. Caller must have already verified hasPMAccess(pmUserId,
 * propertyId, 'UPLOAD_NOTES'). Visibility is always LANDLORD_AND_PM — a PM
 * cannot create a landlord-only note.
 */
export async function createNoteAsPropertyManager(
  pmUserId: mongoose.Types.ObjectId,
  orgId: mongoose.Types.ObjectId,
  input: Omit<CreateNoteInput, 'visibility'>
): Promise<NoteDTO> {
  const note = await PropertyNoteModel.create({
    orgId,
    propertyId: new mongoose.Types.ObjectId(input.propertyId),
    unitId: input.unitId ? new mongoose.Types.ObjectId(input.unitId) : null,
    tenantId: input.tenantId ? new mongoose.Types.ObjectId(input.tenantId) : null,
    createdBy: pmUserId,
    createdByRole: 'property_manager',
    noteType: input.noteType,
    noteText: input.noteText,
    attachments: input.attachments,
    visibility: 'LANDLORD_AND_PM',
  });

  AuditEvent.create({
    actorUserId: pmUserId,
    orgId,
    action: 'NOTE_CREATED',
    entityType: 'propertyNote',
    entityId: note._id,
    source: 'user',
    updateType: 'manual',
    propertyId: note.propertyId,
    tenantId: note.tenantId ?? null,
    diff: { before: null, after: { noteType: note.noteType, visibility: note.visibility } },
  }).catch(() => {});

  return toDTO(note);
}

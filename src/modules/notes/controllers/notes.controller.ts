import { Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { CreateNoteSchema, UpdateNoteSchema, ListNotesQuerySchema } from '../dto/note.dto';
import { createNote, listNotes, updateNote, deleteNote } from '../services/notes.service';
import { NoteCreatedByRole } from '../models/propertyNote.model';

function creatorRole(role: string | undefined): NoteCreatedByRole {
  if (role === 'admin') return 'admin';
  // 'property_manager' will map through once the PM role lands
  return 'landlord';
}

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof ZodError) {
    errorResponse(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Validation error');
    return;
  }
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, 'APP_ERROR', err.message);
    return;
  }
  errorResponse(res, 500, 'INTERNAL_ERROR', fallback);
}

export async function createNoteHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = CreateNoteSchema.parse(req.body);
    const note = await createNote(
      req.auth._id as mongoose.Types.ObjectId,
      creatorRole(req.auth.role),
      body
    );
    successResponse(res, { note }, 201);
  } catch (err) {
    handleError(res, err, 'Failed to create note');
  }
}

export async function listNotesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const query = ListNotesQuerySchema.parse(req.query);
    const result = await listNotes(req.auth._id as mongoose.Types.ObjectId, query);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err, 'Failed to list notes');
  }
}

export async function updateNoteHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const body = UpdateNoteSchema.parse(req.body);
    const note = await updateNote(req.auth._id as mongoose.Types.ObjectId, req.params.noteId, body);
    successResponse(res, { note });
  } catch (err) {
    handleError(res, err, 'Failed to update note');
  }
}

export async function deleteNoteHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?._id) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    await deleteNote(req.auth._id as mongoose.Types.ObjectId, req.params.noteId);
    successResponse(res, { deleted: true });
  } catch (err) {
    handleError(res, err, 'Failed to delete note');
  }
}

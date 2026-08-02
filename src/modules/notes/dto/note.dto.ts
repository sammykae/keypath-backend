import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const AttachmentSchema = z.object({
  fileKey: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
});

export const CreateNoteSchema = z.object({
  propertyId: objectId,
  unitId: objectId.optional(),
  tenantId: objectId.optional(),
  noteType: z.enum(['PROPERTY', 'TENANT', 'MAINTENANCE', 'RENEWAL', 'PAYMENT', 'COMPLIANCE']),
  noteText: z.string().min(1).max(5000),
  attachments: z.array(AttachmentSchema).max(10).default([]),
  visibility: z.enum(['LANDLORD_ONLY', 'LANDLORD_AND_PM']).default('LANDLORD_AND_PM'),
});

export const UpdateNoteSchema = z.object({
  noteType: z.enum(['PROPERTY', 'TENANT', 'MAINTENANCE', 'RENEWAL', 'PAYMENT', 'COMPLIANCE']).optional(),
  noteText: z.string().min(1).max(5000).optional(),
  visibility: z.enum(['LANDLORD_ONLY', 'LANDLORD_AND_PM']).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update' });

export const ListNotesQuerySchema = z.object({
  propertyId: objectId.optional(),
  tenantId: objectId.optional(),
  noteType: z.enum(['PROPERTY', 'TENANT', 'MAINTENANCE', 'RENEWAL', 'PAYMENT', 'COMPLIANCE']).optional(),
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;
export type ListNotesQuery = z.infer<typeof ListNotesQuerySchema>;

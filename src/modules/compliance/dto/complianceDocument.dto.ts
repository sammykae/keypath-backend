import { z } from 'zod';
import { COMPLIANCE_DOCUMENT_TYPES, COMPLIANCE_DOCUMENT_STATUSES } from '../models/complianceDocument.model';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const UploadComplianceDocumentSchema = z.object({
  propertyId: objectId,
  tenantId: objectId.optional(),
  documentType: z.enum(COMPLIANCE_DOCUMENT_TYPES as [string, ...string[]]),
  document: z.object({
    fileKey: z.string().min(1),
    fileName: z.string().min(1),
    fileType: z.string().min(1),
  }),
  expiresAt: z.coerce.date().optional(),
});
export type UploadComplianceDocumentInput = z.infer<typeof UploadComplianceDocumentSchema>;

export const UpdateComplianceStatusSchema = z.object({
  status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED']),
  rejectionReason: z.string().max(1000).optional(),
  expiresAt: z.coerce.date().optional(),
});
export type UpdateComplianceStatusInput = z.infer<typeof UpdateComplianceStatusSchema>;

export const ListComplianceQuerySchema = z.object({
  propertyId: objectId.optional(),
  status: z.enum(COMPLIANCE_DOCUMENT_STATUSES as [string, ...string[]]).optional(),
  documentType: z.enum(COMPLIANCE_DOCUMENT_TYPES as [string, ...string[]]).optional(),
});
export type ListComplianceQuery = z.infer<typeof ListComplianceQuerySchema>;

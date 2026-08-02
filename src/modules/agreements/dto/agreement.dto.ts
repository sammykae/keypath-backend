import { z } from 'zod';
import { AGREEMENT_TYPES } from '../models/agreement.model';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const UploadAgreementSchema = z.object({
  tenantUserId: objectId,
  propertyId: objectId,
  unitId: objectId,
  agreementType: z.enum(AGREEMENT_TYPES as [string, ...string[]]),
  effectiveDate: z.coerce.date().optional(),
  signedAt: z.coerce.date().optional(),
});
export type UploadAgreementInput = z.infer<typeof UploadAgreementSchema>;

export const UpdateAgreementStatusSchema = z.object({
  status: z.enum(['SENT', 'TERMINATED']),
});
export type UpdateAgreementStatusInput = z.infer<typeof UpdateAgreementStatusSchema>;

export const ListAgreementsQuerySchema = z.object({
  propertyId: objectId.optional(),
  unitId: objectId.optional(),
  tenantUserId: objectId.optional(),
  agreementType: z.enum(AGREEMENT_TYPES as [string, ...string[]]).optional(),
});
export type ListAgreementsQuery = z.infer<typeof ListAgreementsQuerySchema>;

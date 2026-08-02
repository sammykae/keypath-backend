import { z } from "zod";

export const UnitCreateSchema = z.object({
  propertyId: z.string().min(1, 'Property ID is required'),
  unitNumber: z.string().min(1, 'Unit number is required'),
  label: z.string().optional(),
  bedrooms: z.number().int().min(0, 'Bedrooms must be non-negative'),
  bathrooms: z.number().min(0, 'Bathrooms must be non-negative'),
  squareFootage: z.number().min(0, 'Square footage must be non-negative').optional(),
  status: z.enum(['VACANT', 'OCCUPIED', 'TURN', 'OFFLINE']).default('VACANT'),
  rent: z.number().min(0, 'Rent must be non-negative'),
  marketRent: z.number().min(0, 'Market rent must be non-negative').optional(),
  scheduledRent: z.number().min(0, 'Scheduled rent must be non-negative').optional()
});

export const UpdateUnitSchema = UnitCreateSchema.partial();

export const UnitResponseSchema = z.object({
  _id: z.string(),
  propertyId: z.string(),
  unitNumber: z.string(),
  label: z.string().optional(),
  bedrooms: z.number(),
  bathrooms: z.number(),
  squareFootage: z.number().optional(),
  status: z.string(),
  rent: z.number(),
  marketRent: z.number().optional(),
  scheduledRent: z.number().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type UnitCreateDTO = z.infer<typeof UnitCreateSchema>;
export type UpdateUnitDTO = z.infer<typeof UpdateUnitSchema>;
export type UnitResponseDTO = z.infer<typeof UnitResponseSchema>;

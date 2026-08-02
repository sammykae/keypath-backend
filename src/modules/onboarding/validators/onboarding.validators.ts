import { z } from 'zod';

// Codex: shared strict validator for ObjectId-like path/body ids.
const objectIdRegex = /^[a-fA-F0-9]{24}$/;

export const submitOnboardingStepSchema = z.object({
  body: z.object({
    stepKey: z
      .string()
      .trim()
      .min(1)
      .max(64),
    payload: z.record(z.string(), z.unknown()).optional().default({}),
  }),
});

export const uploadOnboardingDocumentSchema = z.object({
  body: z.object({
    stepKey: z
      .string()
      .trim()
      .min(1)
      .max(64),
    documentType: z
      .string()
      .trim()
      .min(2)
      .max(64),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional(),
    fileUrl: z.string().url(),
  }),
});

export const verifyOnboardingDocumentSchema = z.object({
  body: z
    .object({
      userId: z.string().regex(objectIdRegex, 'userId must be a valid Mongo ObjectId'),
      documentId: z
        .string()
        .trim()
        .min(16)
        .max(64),
      decision: z.enum(['VERIFIED', 'REJECTED']),
      rejectionReason: z
        .string()
        .trim()
        .min(3)
        .max(300)
        .optional(),
    })
    .superRefine((value, ctx) => {
      // Codex: rejection reason is mandatory when a document is rejected.
      if (value.decision === 'REJECTED' && !value.rejectionReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rejectionReason'],
          message: 'rejectionReason is required when decision=REJECTED',
        });
      }
    }),
});

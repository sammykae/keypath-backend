import { z } from 'zod';

const objectIdRegex = /^[a-fA-F0-9]{24}$/;
const e164PhoneRegex = /^\+?[1-9]\d{6,14}$/;
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const usDateRegex = /^\d{2}\/\d{2}\/\d{4}$/;

export const createTenantInterestSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    country: z.string().trim().min(1).max(120),
    stateOrProvince: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    currentHousingType: z.string().trim().min(1).max(120),
    propertyAddress: z.string().trim().min(1).max(255),
    propertyCountry: z.string().trim().min(1).max(120),
    propertyStateOrProvince: z.string().trim().min(1).max(120),
    propertyCity: z.string().trim().min(1).max(120),
    phoneNumber: z
      .string()
      .trim()
      .regex(e164PhoneRegex, 'phoneNumber must be valid international format, e.g. +15551234567')
      .optional(),
    landlordOrPropertyManagerName: z.string().trim().max(200).optional(),
    message: z.string().trim().max(2000).optional(),
  }),
});

export const listTenantInterestSchema = z.object({
  query: z.object({
    status: z.enum(['SUBMITTED', 'INVITE_GENERATED', 'ONBOARDED']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const generateTenantInviteLinkSchema = z.object({
  params: z.object({
    interestId: z.string().regex(objectIdRegex, 'interestId must be a valid Mongo ObjectId'),
  }),
  body: z.object({
    expiresInHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
    frontendUrl: z.string().url().optional(),
  }),
});

export const resolveTenantInviteSchema = z.object({
  query: z.object({
    token: z.string().trim().min(10),
  }),
});

export const createTenantAccountSchema = z.object({
  body: z
    .object({
      onboardingToken: z.string().trim().min(10).optional(),
      email: z.string().trim().email().max(254),
      password: z.string().min(8).max(128),
      confirmPassword: z.string().min(8).max(128),
      phone: z.string().trim().regex(e164PhoneRegex).optional(),
    })
    .superRefine((value, ctx) => {
      if (value.password !== value.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['confirmPassword'],
          message: 'confirmPassword must match password',
        });
      }
    }),
});

export const tenantIdentityVerificationSchema = z.object({
  body: z
    .object({
      fullName: z.string().trim().min(1).max(200).optional(),
      legalFullName: z.string().trim().min(1).max(200).optional(),
      dateOfBirth: z
        .string()
        .trim()
        .refine(
          (value) => isoDateRegex.test(value) || usDateRegex.test(value),
          'dateOfBirth must be in YYYY-MM-DD or MM/DD/YYYY format'
        )
        .optional(),
      dob: z
        .string()
        .trim()
        .refine(
          (value) => isoDateRegex.test(value) || usDateRegex.test(value),
          'dob must be in YYYY-MM-DD or MM/DD/YYYY format'
        )
        .optional(),
      phoneNumber: z
        .string()
        .trim()
        .regex(
          e164PhoneRegex,
          'phoneNumber must be valid international format, e.g. +15551234567'
        )
        .optional(),
      phone: z
        .string()
        .trim()
        .regex(
          e164PhoneRegex,
          'phone must be valid international format, e.g. +15551234567'
        )
        .optional(),
      acceptedTermsAndPrivacyPolicy: z.boolean().optional(),
      acceptedTerms: z.boolean().optional(),
      acceptedTermsOfUse: z.boolean().optional(),
      acceptedPrivacyPolicy: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
      if (!value.fullName && !value.legalFullName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fullName'],
          message: 'fullName is required',
        });
      }

      if (!value.dateOfBirth && !value.dob) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dateOfBirth'],
          message: 'dateOfBirth is required',
        });
      }

      if (!value.phoneNumber && !value.phone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phoneNumber'],
          message: 'phoneNumber is required',
        });
      }

      const consentAccepted =
        value.acceptedTermsAndPrivacyPolicy === true ||
        value.acceptedTerms === true ||
        (value.acceptedTermsOfUse === true &&
          value.acceptedPrivacyPolicy === true);

      if (!consentAccepted) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['acceptedTermsAndPrivacyPolicy'],
          message:
            'You must accept the Terms of Use and Privacy Policy to continue',
        });
      }
    }),
});

export const tenantLeaseAssociationLookupSchema = z.object({
  body: z.object({
    propertyCode: z.string().trim().min(2).max(64),
  }),
});

export const tenantLeaseAssociationSchema = z.object({
  body: z.object({
    propertyCode: z.string().trim().min(2).max(64),
    unitId: z.string().regex(objectIdRegex, 'unitId must be a valid Mongo ObjectId'),
  }),
});

export const tenantProgramExplanationSchema = z.object({
  body: z
    .object({
      acknowledgedNoOwnership: z.boolean().optional(),
      acknowledgement: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
      if (
        value.acknowledgedNoOwnership !== true &&
        value.acknowledgement !== true
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['acknowledgedNoOwnership'],
          message:
            'You must acknowledge that the program does not grant ownership, title, or property rights',
        });
      }
    }),
});

export const tenantParticipationStatusSchema = z.object({
  body: z.object({}).passthrough(),
});

export const tenantDashboardWalkthroughSchema = z.object({
  body: z
    .object({
      confirmedAccurateAndNoOwnershipRights: z.boolean().optional(),
      acknowledgedFinalTerms: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
      if (
        value.confirmedAccurateAndNoOwnershipRights !== true &&
        value.acknowledgedFinalTerms !== true
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['confirmedAccurateAndNoOwnershipRights'],
          message:
            'You must confirm your information and the non-ownership disclosure to finish onboarding',
        });
      }
    }),
});

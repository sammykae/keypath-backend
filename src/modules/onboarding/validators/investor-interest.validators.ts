import { z } from 'zod';

const e164PhoneRegex = /^\+?[1-9]\d{6,14}$/;
const objectIdRegex = /^[a-fA-F0-9]{24}$/;

export const createInvestorInterestSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    investorType: z.string().trim().min(1).max(120),
    phoneNumber: z
      .string()
      .trim()
      .regex(
        e164PhoneRegex,
        'phoneNumber must be valid international format, e.g. +15551234567'
      )
      .optional(),
    typicalCheckSize: z.string().trim().max(120).optional(),
    linkedinUrl: z.string().trim().url().max(500).optional(),
    message: z.string().trim().max(2000).optional(),
  }),
});

export const listInvestorInterestSchema = z.object({
  query: z.object({
    status: z.enum(['SUBMITTED', 'INVITE_GENERATED', 'ONBOARDED']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const generateInvestorInviteLinkSchema = z.object({
  params: z.object({
    interestId: z
      .string()
      .regex(objectIdRegex, 'interestId must be a valid Mongo ObjectId'),
  }),
  body: z.object({
    expiresInHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
    frontendUrl: z.string().url().optional(),
  }),
});

export const resolveInvestorInviteSchema = z.object({
  query: z.object({
    token: z.string().trim().min(10),
  }),
});

export const createInvestorAccountSchema = z.object({
  body: z
    .object({
      onboardingToken: z.string().trim().min(10),
      investorType: z.enum([
        'INDIVIDUAL_INVESTOR',
        'INVESTING_ON_BEHALF_OF_A_FIRM',
      ]),
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().min(1).max(100),
      email: z.string().trim().email().max(254),
      password: z.string().min(8).max(128),
      confirmPassword: z.string().min(8).max(128),
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
      countryOfResidence: z.string().trim().min(1).max(120),
      linkedinUrl: z.string().trim().url().max(500).optional(),
      linkedInProfileUrl: z.string().trim().url().max(500).optional(),
      jobTitle: z.string().trim().max(200).optional(),
      legalCompanyName: z.string().trim().max(200).optional(),
      streetAddress: z.string().trim().max(200).optional(),
      companyCountry: z.string().trim().max(120).optional(),
      companyStateOrProvince: z.string().trim().max(120).optional(),
      companyCity: z.string().trim().max(120).optional(),
      companyEmail: z.string().trim().email().max(254).optional(),
      companyPhoneNumber: z
        .string()
        .trim()
        .regex(
          e164PhoneRegex,
          'companyPhoneNumber must be valid international format, e.g. +15551234567'
        )
        .optional(),
    })
    .superRefine((value, ctx) => {
      if (value.password !== value.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['confirmPassword'],
          message: 'confirmPassword must match password',
        });
      }

      if (value.investorType === 'INVESTING_ON_BEHALF_OF_A_FIRM') {
        const requiredFirmFields: Array<keyof typeof value> = [
          'jobTitle',
          'legalCompanyName',
          'streetAddress',
          'companyCountry',
          'companyStateOrProvince',
          'companyCity',
          'companyEmail',
        ];

        for (const field of requiredFirmFields) {
          const fieldValue = value[field];
          if (typeof fieldValue !== 'string' || !fieldValue.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [field],
              message: `${field} is required when investing on behalf of a firm`,
            });
          }
        }
      }
    }),
});

export const investorStatusAcknowledgmentSchema = z.object({
  body: z.object({
    confirmsAccreditedInvestorStatus: z.literal(true),
    understandsNoGovernanceOccupancyOwnershipRights: z.literal(true),
    acknowledgesVerificationOccursOutsidePlatform: z.literal(true),
  }),
});

export const investorInvestmentPreferencesSchema = z.object({
  body: z.object({
    portfolioExposure: z.enum([
      'PORTFOLIO_LEVEL_EXPOSURE',
      'PROPERTY_LEVEL_SUMMARIES',
      'UNIT_LEVEL_SUMMARIES',
    ]),
    geography: z.enum(['TEXAS', 'CALIFORNIA', 'FLORIDA', 'NATIONAL']),
    riskProfile: z.enum(['CONSERVATIVE', 'BALANCED', 'GROWTH']),
  }),
});

export const investorLegalAcknowledgmentsSchema = z.object({
  body: z.object({
    understandsNoGovernanceOrVotingRights: z.literal(true),
    understandsNoOccupancyOrTenantRights: z.literal(true),
    understandsReturnsAreNotGuaranteed: z.literal(true),
    acknowledgesEconomicParticipationOnly: z.literal(true),
  }),
});

export const investorAllSetSchema = z.object({
  body: z.object({
    certificationAccepted: z.literal(true),
  }),
});

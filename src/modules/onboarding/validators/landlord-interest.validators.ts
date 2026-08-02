import { z } from 'zod';

const objectIdRegex = /^[a-fA-F0-9]{24}$/;
const e164PhoneRegex = /^\+?[1-9]\d{6,14}$/;

export const createLandlordInterestSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    propertyType: z.string().trim().min(1).max(120),
    titleOrRoleAtOrganization: z.string().trim().min(1).max(150),
    country: z.string().trim().min(1).max(120),
    stateOrProvince: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    phoneNumber: z
      .string()
      .trim()
      .regex(e164PhoneRegex, 'phoneNumber must be valid international format, e.g. +15551234567')
      .optional(),
    numberOfUnitsRange: z.string().trim().max(120).optional(),
    messageNotes: z.string().trim().max(2000).optional(),
  }),
});

export const listLandlordInterestSchema = z.object({
  query: z.object({
    status: z.enum(['SUBMITTED', 'INVITE_GENERATED', 'ONBOARDED']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const generateLandlordInviteLinkSchema = z.object({
  params: z.object({
    interestId: z.string().regex(objectIdRegex, 'interestId must be a valid Mongo ObjectId'),
  }),
  body: z.object({
    expiresInHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
    frontendUrl: z.string().url().optional(),
  }),
});

export const resolveLandlordInviteSchema = z.object({
  query: z.object({
    token: z.string().trim().min(10),
  }),
});

export const createLandlordAccountSchema = z.object({
  body: z
    .object({
      onboardingToken: z.string().trim().min(10),
      email: z.string().trim().email().max(254),
      password: z.string().min(8).max(128),
      confirmPassword: z.string().min(8).max(128),
      phone: z.string().trim().regex(e164PhoneRegex).optional(),
      roleSelection: z.enum(['LANDLORD', 'DEVELOPER']).default('LANDLORD'),
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

export const landlordPropertyDetailsSchema = z.object({
  body: z.object({
    propertyType: z.string().trim().min(1).max(120),
    yearBuilt: z.coerce.number().int().min(1700).max(new Date().getFullYear()),
    totalUnits: z.coerce.number().int().min(1).max(100000),
    sqFootage: z.coerce.number().int().min(1).max(100000000).optional(),
    country: z.string().trim().min(1).max(120),
    stateOrProvince: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    address: z.string().trim().min(3).max(255),
    zipCode: z.string().trim().min(2).max(20),
    estimatedPropertyValue: z.coerce.number().positive().max(1000000000000),
  }),
});

export const landlordProgramSelectionSchema = z.object({
  body: z.object({
    programSelection: z.enum(['RPA_ONLY', 'TEPA_ONLY', 'RPA_TEPA']),
    applyToAllUnits: z.boolean().default(true),
    notes: z.string().trim().max(2000).optional(),
  }),
});

const normalizeEnumInput = (value: string) =>
  value.trim().toUpperCase().replace(/[\s-]+/g, '_');

const enumTextSchema = (fieldName: string, allowedValues: readonly string[]) =>
  z.string().trim().refine((value) => allowedValues.includes(normalizeEnumInput(value)), {
    message: `${fieldName} must be one of: ${allowedValues.join(', ')}`,
  });

const percentageSchema = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, 'Value must be a number'),
  ])
  .refine((value) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) && numeric > 0 && numeric <= 100;
  }, {
    message: 'Value must be greater than 0 and at most 100',
  });

const programEconomicsEligibleBehaviorsSchema = z.object({
  onTimeRentPayment: z.literal(true),
  lengthOfTenancy: z.boolean(),
  leaseRenewal: z.boolean(),
  goodStandingNoViolations: z.boolean(),
});

export const landlordProgramEconomicsRulesSchema = z.object({
  body: z.object({
    tenantEconomicParticipationPool: percentageSchema,
    eligibleBehaviors: programEconomicsEligibleBehaviorsSchema,
    participationPace: enumTextSchema('participationPace', [
      'SLOW',
      'STANDARD',
      'ACCELERATED',
      'SLOW_LONG_TERM_RETENTION_FOCUS',
      'ACCELERATED_HIGHER_ENGAGEMENT_HIGHER_EXPOSURE',
    ]),
    landlordBuybackOption: enumTextSchema('landlordBuybackOption', [
      'FAIR_VALUE',
      'DISCOUNTED_VALUE',
      'NOT_ALLOWED',
      'FAIR',
      'DISCOUNTED',
    ]),
    thirdPartyInvestorRules: enumTextSchema('thirdPartyInvestorRules', [
      'NOT_TRANSFERABLE',
      'TRANSFERABLE_ONLY_ON_PROPERTY_SALE',
      'TRANSFERABLE_WITH_LANDLORD_APPROVAL',
      'TRANSFERABLE_ON_PROPERTY_SALE',
    ]),
    tenantRentIncreaseCap: enumTextSchema('tenantRentIncreaseCap', [
      'STANDARD_MARKET_INCREASES',
      'CAPPED_INCREASES_FOR_LONG_TERM_TENANTS',
      'CAPPED_INCREASES_LONG_TERM_TENANTS',
    ]),
    notes: z.string().trim().max(2000).optional(),
  }),
});

export const landlordFrameworkAcknowledgementSchema = z.object({
  body: z
    .object({
      noOwnershipTransferAcknowledged: z.boolean().optional(),
      understandsNoOwnershipTransfer: z.boolean().optional(),
      ownershipRightsAcknowledged: z.boolean().optional(),
      acknowledgement: z.boolean().optional(),
      notes: z.string().trim().max(2000).optional(),
    })
    .refine(
      (value) =>
        value.noOwnershipTransferAcknowledged === true ||
        value.understandsNoOwnershipTransfer === true ||
        value.ownershipRightsAcknowledged === true ||
        value.acknowledgement === true,
      {
        message:
          'You must acknowledge that the program does not grant ownership, title, or property rights',
      }
    ),
});

const complianceAcknowledgementsBooleanFieldsSchema = z.object({
  rewardsParticipationAgreementAndTenantProtections: z.boolean().optional(),
  rewardsParticipationAgreementAcknowledged: z.boolean().optional(),
  rewardsParticipationAcknowledged: z.boolean().optional(),
  tepaOptionalAndProgramRules: z.boolean().optional(),
  tepaOptionalAndFollowsProgramRules: z.boolean().optional(),
  tepaOptionalAcknowledged: z.boolean().optional(),
  aggregateDataAnonymizedNoPii: z.boolean().optional(),
  aggregateDataSharedAnonymizedNoPii: z.boolean().optional(),
  dataPrivacyAcknowledged: z.boolean().optional(),
  exitAndOptOutProceduresReviewed: z.boolean().optional(),
  exitAndOptOutAcknowledged: z.boolean().optional(),
  exitProceduresAcknowledged: z.boolean().optional(),
});

const resolveComplianceAcknowledgementValue = (
  root: Record<string, unknown>,
  nested: Record<string, unknown>,
  keys: string[],
  quickAgree: boolean
) => {
  if (quickAgree) {
    return true;
  }

  for (const key of keys) {
    const rootValue = root[key];
    if (typeof rootValue === 'boolean') {
      return rootValue;
    }

    const nestedValue = nested[key];
    if (typeof nestedValue === 'boolean') {
      return nestedValue;
    }
  }

  return false;
};

export const landlordComplianceAcknowledgementsSchema = z.object({
  body: z
    .object({
      acknowledgements: complianceAcknowledgementsBooleanFieldsSchema.optional(),
      ...complianceAcknowledgementsBooleanFieldsSchema.shape,
      agreeAndContinue: z.boolean().optional(),
      allAcknowledged: z.boolean().optional(),
      notes: z.string().trim().max(2000).optional(),
    })
    .refine((value) => {
      const root = value as Record<string, unknown>;
      const nested = (value.acknowledgements ?? {}) as Record<string, unknown>;
      const quickAgree = value.agreeAndContinue === true || value.allAcknowledged === true;

      const rewards = resolveComplianceAcknowledgementValue(
        root,
        nested,
        [
          'rewardsParticipationAgreementAndTenantProtections',
          'rewardsParticipationAgreementAcknowledged',
          'rewardsParticipationAcknowledged',
        ],
        quickAgree
      );
      const tepa = resolveComplianceAcknowledgementValue(
        root,
        nested,
        [
          'tepaOptionalAndProgramRules',
          'tepaOptionalAndFollowsProgramRules',
          'tepaOptionalAcknowledged',
        ],
        quickAgree
      );
      const aggregate = resolveComplianceAcknowledgementValue(
        root,
        nested,
        [
          'aggregateDataAnonymizedNoPii',
          'aggregateDataSharedAnonymizedNoPii',
          'dataPrivacyAcknowledged',
        ],
        quickAgree
      );
      const exit = resolveComplianceAcknowledgementValue(
        root,
        nested,
        [
          'exitAndOptOutProceduresReviewed',
          'exitAndOptOutAcknowledged',
          'exitProceduresAcknowledged',
        ],
        quickAgree
      );

      return rewards === true && tepa === true && aggregate === true && exit === true;
    }, {
      message:
        'All compliance acknowledgements must be accepted before continuing',
    }),
});

export const landlordReviewActivateSchema = z.object({
  body: z
    .object({
      certificationAccepted: z.boolean().optional(),
      certifyAndActivate: z.boolean().optional(),
      certifyAccuracyAndAuthority: z.boolean().optional(),
      understandsNoTitleTransfer: z.boolean().optional(),
      statementAcknowledged: z.boolean().optional(),
      agreeAndActivate: z.boolean().optional(),
      activateProgram: z.boolean().optional(),
      certify: z.boolean().optional(),
      certification: z
        .object({
          accepted: z.boolean().optional(),
        })
        .optional(),
      notes: z.string().trim().max(2000).optional(),
    })
    .refine((value) => {
      const acceptedValues = [
        value.certificationAccepted,
        value.certifyAndActivate,
        value.certifyAccuracyAndAuthority,
        value.understandsNoTitleTransfer,
        value.statementAcknowledged,
        value.agreeAndActivate,
        value.activateProgram,
        value.certify,
        value.certification?.accepted,
      ];

      return acceptedValues.some((entry) => entry === true);
    }, {
      message: 'Certification acknowledgement is required to activate the program',
    }),
});

const manualOrUploadSchema = z.enum(['manual', 'upload']);

const ownerDeedComplianceSchema = z.object({
  inputMode: manualOrUploadSchema.optional(),
  uploadedDocumentIds: z.array(z.string().trim().min(1)).optional(),
  legalOwnerName: z.string().trim().max(200).optional(),
  ownershipType: z.string().trim().max(120).optional(),
  countryOfFormation: z.string().trim().max(120).optional(),
  stateOfFormation: z.string().trim().max(120).optional(),
  tinVat: z.string().trim().max(120).optional(),
  operatingAgreementOnFile: z.boolean().optional(),
  authorizedSignatoryName: z.string().trim().max(200).optional(),
  authorizedSignatoryTitle: z.string().trim().max(200).optional(),
  deedType: z.string().trim().max(120).optional(),
  recordingDate: z.string().trim().max(50).optional(),
  titleCompany: z.string().trim().max(200).optional(),
  titleInsuranceInPlace: z.boolean().optional(),
  anyCoOwners: z.boolean().optional(),
});

const mortgageComplianceSchema = z.object({
  inputMode: manualOrUploadSchema.optional(),
  uploadedDocumentIds: z.array(z.string().trim().min(1)).optional(),
  hasLender: z.boolean().optional(),
  lenderName: z.string().trim().max(200).optional(),
  loanType: z.string().trim().max(120).optional(),
  maturityDate: z.string().trim().max(50).optional(),
});

const insuranceComplianceSchema = z.object({
  inputMode: manualOrUploadSchema.optional(),
  uploadedDocumentIds: z.array(z.string().trim().min(1)).optional(),
  carrier: z.string().trim().max(200).optional(),
  provider: z.string().trim().max(200).optional(),
  policyNumber: z.string().trim().max(120).optional(),
  policyType: z.string().trim().max(120).optional(),
  effectiveDate: z.string().trim().max(50).optional(),
  expirationDate: z.string().trim().max(50).optional(),
  dwellingCoverage: z.coerce.number().positive().max(1000000000000).optional(),
  personalPropertyCoverage: z.coerce.number().positive().max(1000000000000).optional(),
  liabilityCoverage: z.coerce.number().positive().max(1000000000000).optional(),
  lossOfRentCoverage: z.coerce.number().positive().max(1000000000000).optional(),
  deductible: z.coerce.number().positive().max(1000000000000).optional(),
  floodInsurance: z.boolean().optional(),
  earthquakeInsurance: z.boolean().optional(),
  umbrellaPolicy: z.boolean().optional(),
  namedInsuredMatchesDeed: z.boolean().optional(),
  additionalInsured: z.string().trim().max(200).optional(),
  mortgageeListed: z.boolean().optional(),
  claimsPast5Years: z.boolean().optional(),
  openClaims: z.boolean().optional(),
});

const rpaComplianceSchema = z.object({
  legalOwnerName: z.string().trim().max(200).optional(),
  ownershipType: z.string().trim().max(120).optional(),
  countryOfFormation: z.string().trim().max(120).optional(),
  stateOfFormation: z.string().trim().max(120).optional(),
  tinVat: z.string().trim().max(120).optional(),
  riskAttestation: z
    .object({
      noActiveCodeViolations: z.boolean().optional(),
      noPendingHousingLitigation: z.boolean().optional(),
    })
    .optional(),
});

export const landlordComplianceDocumentsSchema = z.object({
  body: z
    .object({
      ownerDeed: ownerDeedComplianceSchema.optional(),
      mortgage: mortgageComplianceSchema.optional(),
      insurance: insuranceComplianceSchema.optional(),
      rpaCompliance: rpaComplianceSchema.optional(),
      notes: z.string().trim().max(3000).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field must be provided',
    }),
});

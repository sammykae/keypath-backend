import { z } from 'zod';

const e164PhoneRegex = /^\+?[1-9]\d{6,14}$/;
const objectIdRegex = /^[a-fA-F0-9]{24}$/;

export const createCommunityInterestSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    organizationName: z.string().trim().min(1).max(200),
    stakeholderType: z.string().trim().min(1).max(120),
    titleOrRoleAtOrganization: z.string().trim().min(1).max(200),
    phoneNumber: z
      .string()
      .trim()
      .regex(
        e164PhoneRegex,
        'phoneNumber must be valid international format, e.g. +15551234567'
      )
      .optional(),
    cityOrRegionServed: z.string().trim().max(200).optional(),
    messageContext: z.string().trim().max(2000).optional(),
  }),
});

export const listCommunityInterestSchema = z.object({
  query: z.object({
    status: z.enum(['SUBMITTED', 'INVITE_GENERATED', 'ONBOARDED']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const generateCommunityInviteLinkSchema = z.object({
  params: z.object({
    interestId: z
      .string()
      .regex(objectIdRegex, 'interestId must be a valid Mongo ObjectId'),
  }),
  body: z.object({
    expiresInHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
    frontendUrl: z.string().url().optional(),
    assignedRole: z
      .enum(['COMMUNITY', 'COMMUNITY_STAKEHOLDER'])
      .optional(),
  }),
});

export const resolveCommunityInviteSchema = z.object({
  query: z.object({
    token: z.string().trim().min(10),
  }),
});

export const createCommunityAccountSchema = z.object({
  body: z
    .object({
      onboardingToken: z.string().trim().min(10),
      email: z.string().trim().email().max(254),
      password: z.string().min(8).max(128),
      confirmPassword: z.string().min(8).max(128),
      phone: z
        .string()
        .trim()
        .regex(
          e164PhoneRegex,
          'phone must be valid international format, e.g. +15551234567'
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
    }),
});

export const communityOrganizationInformationSchema = z.object({
  body: z.object({
    organizationName: z.string().trim().min(1).max(200),
    titleRoleAtOrganization: z.string().trim().min(1).max(200).optional(),
    cityRegionServed: z.string().trim().min(1).max(200).optional(),
    phoneNumber: z
      .string()
      .trim()
      .regex(
        e164PhoneRegex,
        'phoneNumber must be valid international format, e.g. +15551234567'
      )
      .optional(),
    department: z.string().trim().max(200).optional(),
    jurisdiction: z.string().trim().max(200).optional(),
    role: z.string().trim().max(120).optional(),
  }).superRefine((value, ctx) => {
    const titleRole = value.titleRoleAtOrganization ?? value.role;
    const cityRegion = value.cityRegionServed ?? value.jurisdiction;

    if (!titleRole?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['titleRoleAtOrganization'],
        message: 'titleRoleAtOrganization is required',
      });
    }

    if (!cityRegion?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cityRegionServed'],
        message: 'cityRegionServed is required',
      });
    }
  }),
});

export const communityStakeholderTypeSchema = z.object({
  body: z.object({
    stakeholderType: z.enum([
      'MUNICIPALITY_CITY_AGENCY',
      'HOUSING_AUTHORITY',
      'LAND_AUTHORITY',
      'UNIVERSITY_SCHOOL',
      'FAITH_BASED_ORGANIZATION',
      'NONPROFIT',
      'OTHER',
    ]),
  }),
});

export const communityProgramAssociationSchema = z.object({
  body: z.object({
    // Enger Blessing — min changed from 1 to 0; project selection is optional
    projectIds: z
      .array(
        z.string().regex(objectIdRegex, 'projectIds must contain valid Mongo ObjectIds')
      )
      .min(0)
      .optional(),
    selectedProjectIds: z
      .array(
        z
          .string()
          .regex(
            objectIdRegex,
            'selectedProjectIds must contain valid Mongo ObjectIds'
          )
      )
      .min(0)
      .optional(),
    programProjectIds: z
      .array(
        z
          .string()
          .regex(
            objectIdRegex,
            'programProjectIds must contain valid Mongo ObjectIds'
          )
      )
      .min(0)
      .optional(),
    oversightLevel: z.enum([
      'PORTFOLIO_LEVEL_OVERVIEW',
      'PROJECT_LEVEL_VISIBILITY',
    ]),
  }),
});

export const communityDataVisibilityPrivacySchema = z.object({
  body: z.object({
    acknowledgedVisibilityRules: z.boolean().optional(),
    reviewed: z.boolean().optional(),
  }),
});

export const communityImpactGoalsSchema = z.object({
  body: z.object({
    impactGoals: z
      .array(
        z.enum([
          'HOUSING_STABILITY_AND_TENANT_RETENTION',
          'LOCAL_JOB_CREATION',
          'LOCAL_VENDOR_AND_SMALL_BUSINESS_USAGE',
          'ESG_AND_COMMUNITY_COMMITMENTS',
        ])
      )
      .min(1)
      .optional(),
    selectedImpactGoals: z
      .array(
        z.enum([
          'HOUSING_STABILITY_AND_TENANT_RETENTION',
          'LOCAL_JOB_CREATION',
          'LOCAL_VENDOR_AND_SMALL_BUSINESS_USAGE',
          'ESG_AND_COMMUNITY_COMMITMENTS',
        ])
      )
      .min(1)
      .optional(),
    goals: z
      .array(
        z.enum([
          'HOUSING_STABILITY_AND_TENANT_RETENTION',
          'LOCAL_JOB_CREATION',
          'LOCAL_VENDOR_AND_SMALL_BUSINESS_USAGE',
          'ESG_AND_COMMUNITY_COMMITMENTS',
        ])
      )
      .min(1)
      .optional(),
    acknowledgedOversightAccessAndExitRules: z.boolean(),
  }),
});

export const communityReviewActivateSchema = z.object({
  body: z.object({
    certificationAccepted: z.boolean().optional(),
    authorizedAccessCertification: z.boolean().optional(),
    certifyAndActivate: z.boolean().optional(),
    confirmActivate: z.boolean().optional(),
  }),
});

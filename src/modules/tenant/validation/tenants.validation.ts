// src/modules/tenants/tenant.validation.ts
import { z } from "zod";

/**
 * Reusable primitives
 */
export const PhoneE164 = z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid E.164 phone");
export const Email = z.string().email().max(254);

// ISODate accepts either an ISO string parseable by Date or a Date object
export const ISODate = z.union([
  z.string().refine((s) => !isNaN(Date.parse(s)), { message: "Invalid ISO date string" }),
  z.date(),
]);

/**
 * Sub-schemas
 */
export const AddressZ = z.object({
  address1: z.string().min(1).max(120),
  address2: z.string().optional(),
  city: z.string().min(1).max(60),
  state: z.string().min(1).max(30),
  postalCode: z.string().min(2).max(20),
  country: z.string().length(2), // ISO alpha-2, e.g. "US"
  moveInDate: ISODate.optional(),
  moveOutDate: ISODate.optional(),
});

export const EmergencyContactZ = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  relationship: z.string().min(2),
  phone: PhoneE164,
  email: Email.optional(),
});

export const EmploymentZ = z.object({
  status: z.enum(["employed", "self_employed", "student", "unemployed", "retired"]),
  employerName: z.string().optional(),
  title: z.string().optional(),
  startDate: ISODate.optional(),
  endDate: ISODate.optional(),
  employerContact: z
    .object({
      name: z.string().optional(),
      phone: PhoneE164.optional(),
      email: Email.optional(),
    })
    .optional(),
  monthlyIncome: z.number().nonnegative().optional(),
  proofDocs: z.array(z.string()).optional(), // file IDs
});

export const RentalRefZ = z.object({
  address: z.string().optional(),
  landlordName: z.string().optional(),
  landlordPhone: PhoneE164.optional(),
  landlordEmail: Email.optional(),
  monthlyRent: z.number().nonnegative().optional(),
  startDate: ISODate.optional(),
  endDate: ISODate.optional(),
  reasonForLeaving: z.string().optional(),
  referenceDocs: z.array(z.string()).optional(),
});

/**
 * DTOs (public exports used by routes/controllers/services)
 */

// A) Signup (core)
export const TenantSignupZ = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: Email,
  mobilePhone: PhoneE164,
  password: z.string().min(8).max(200),
  marketingOptIn: z.boolean().optional(),
  termsAcceptedAt: ISODate, // frontend should send ISO string or Date
});
export type TenantSignupDTO = z.infer<typeof TenantSignupZ>;

// B) Screening (complete profile before application submit)
export const TenantScreeningZ = z.object({
  dateOfBirth: ISODate,
  currentAddress: AddressZ,
  employment: z.array(EmploymentZ).min(1).optional(),
  otherIncome: z
    .array(
      z.object({
        type: z.string(),
        monthlyAmount: z.number().nonnegative(),
      })
    )
    .optional(),
  rentalHistory: z.array(RentalRefZ).min(1).optional(),
  governmentId: z
    .object({
      type: z.string().optional(),
      numberLast4: z.string().max(4).optional(),
      issuer: z.string().optional(),
      expiresAt: ISODate.optional(),
    })
    .optional(),
  // Sensitive identifiers - collect only if required by partner/CRA
  ssnLast4: z.string().length(4).optional(),
  ssnFullEncrypted: z.string().optional(), // should be encrypted in app layer
});
export type TenantScreeningDTO = z.infer<typeof TenantScreeningZ>;

// C) Emergency contact
export const TenantEmergencyZ = EmergencyContactZ;
export type TenantEmergencyDTO = z.infer<typeof TenantEmergencyZ>;

// D) Preferences & household
export const TenantPrefsZ = z.object({
  householdSize: z.number().int().min(1),
  pets: z
    .array(
      z.object({
        type: z.string(),
        breed: z.string().optional(),
        weightLbs: z.number().nonnegative().optional(),
        shotsVerified: z.boolean().optional(),
      })
    )
    .optional(),
  vehicles: z
    .array(
      z.object({
        make: z.string().optional(),
        model: z.string().optional(),
        color: z.string().optional(),
        plate: z.string().optional(),
        state: z.string().optional(),
      })
    )
    .optional(),
  communicationPrefs: z.array(z.enum(["sms", "email", "in_app"])).optional(),
});
export type TenantPrefsDTO = z.infer<typeof TenantPrefsZ>;

// E) Payment method (PSP token only)
export const TenantPaymentMethodZ = z.object({
  method: z.enum(["ach", "card", "other"]),
  token: z.string().min(1), // PSP token / payment method id
});
export type TenantPaymentMethodDTO = z.infer<typeof TenantPaymentMethodZ>;

// F) Rent reporting consent
export const RentReportingConsentZ = z.object({
  optIn: z.boolean(),
  consentAt: ISODate,
});
export type RentReportingConsentDTO = z.infer<typeof RentReportingConsentZ>;

// G) Document upload metadata
export const TenantDocZ = z.object({
  type: z.enum(["ID_FRONT", "ID_BACK", "PAYSTUB", "BANK_STATEMENT", "PET_VACCINE", "OTHER"]),
  fileId: z.string().min(1),
});
export type TenantDocDTO = z.infer<typeof TenantDocZ>;

import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { generateJwt, generateRefreshJwt } from '../../../core/config/passport';
import { User } from '../../auth/models/user.model';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { OnboardingState } from '../models/onboarding-state.model';
import { Organization } from '../../orgs/models/organization.model';
import { Membership } from '../../orgs/models/membership.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import {
  assertLandlordRegistrationEligibility,
  consumeLandlordInviteToken,
} from './landlord-interest.service';
import { issueOtpForUser, verifyUserOtp } from '../../../core/email/email-otp.service';

const CREATE_ACCOUNT_STEP = 'create_account';
const PROPERTY_DETAILS_STEP = 'property_details';
const PROGRAM_SELECTION_STEP = 'program_selection';
const COMPLIANCE_DOCUMENTS_STEP = 'compliance_documents';
const PROGRAM_ECONOMICS_RULES_STEP = 'program_economics_rules';
const FRAMEWORK_ACKNOWLEDGEMENT_STEP = 'framework_acknowledgement';
const COMPLIANCE_ACKNOWLEDGEMENTS_STEP = 'compliance_acknowledgements';
const REVIEW_ACTIVATE_STEP = 'review_activate';
const FRAMEWORK_ACKNOWLEDGEMENT_STATEMENT =
  'I understand this program does not grant ownership, title, or property rights.';
const COMPLIANCE_ACKNOWLEDGEMENTS_REQUIRED_ITEMS = [
  {
    key: 'rewardsParticipationAgreementAndTenantProtections',
    text: 'I acknowledge the Rewards Participation Agreement and tenant protections.',
  },
  {
    key: 'tepaOptionalAndProgramRules',
    text: 'I understand TEPA is optional and any tenant equity participation follows program rules.',
  },
  {
    key: 'aggregateDataAnonymizedNoPii',
    text: 'I agree that all aggregate data shared is anonymized and no PII is disclosed.',
  },
  {
    key: 'exitAndOptOutProceduresReviewed',
    text: 'I have reviewed exit and opt-out procedures and understand obligations.',
  },
] as const;
const REVIEW_ACTIVATE_CERTIFICATION_STATEMENT =
  'I certify the above information is accurate and my organization is authorized to define participation rules. I understand this does not transfer title, deed, or control.';
const LANDLORD_FINAL_REQUIRED_STEPS = [
  CREATE_ACCOUNT_STEP,
  PROPERTY_DETAILS_STEP,
  PROGRAM_SELECTION_STEP,
  COMPLIANCE_DOCUMENTS_STEP,
  PROGRAM_ECONOMICS_RULES_STEP,
  FRAMEWORK_ACKNOWLEDGEMENT_STEP,
  COMPLIANCE_ACKNOWLEDGEMENTS_STEP,
] as const;

const PARTICIPATION_PACE_VALUES = [
  'SLOW',
  'STANDARD',
  'ACCELERATED',
] as const;
const LANDLORD_BUYBACK_OPTION_VALUES = [
  'FAIR_VALUE',
  'DISCOUNTED_VALUE',
  'NOT_ALLOWED',
] as const;
const THIRD_PARTY_INVESTOR_RULE_VALUES = [
  'NOT_TRANSFERABLE',
  'TRANSFERABLE_ONLY_ON_PROPERTY_SALE',
  'TRANSFERABLE_WITH_LANDLORD_APPROVAL',
] as const;
const TENANT_RENT_INCREASE_CAP_VALUES = [
  'STANDARD_MARKET_INCREASES',
  'CAPPED_INCREASES_FOR_LONG_TERM_TENANTS',
] as const;

const PARTICIPATION_PACE_ALIASES = {
  SLOW_LONG_TERM_RETENTION_FOCUS: 'SLOW',
  ACCELERATED_HIGHER_ENGAGEMENT_HIGHER_EXPOSURE: 'ACCELERATED',
} as const;
const LANDLORD_BUYBACK_OPTION_ALIASES = {
  FAIR: 'FAIR_VALUE',
  DISCOUNTED: 'DISCOUNTED_VALUE',
} as const;
const THIRD_PARTY_INVESTOR_RULE_ALIASES = {
  TRANSFERABLE_ON_PROPERTY_SALE: 'TRANSFERABLE_ONLY_ON_PROPERTY_SALE',
} as const;
const TENANT_RENT_INCREASE_CAP_ALIASES = {
  CAPPED_INCREASES_LONG_TERM_TENANTS: 'CAPPED_INCREASES_FOR_LONG_TERM_TENANTS',
} as const;

export interface CreateLandlordAccountInput {
  onboardingToken: string;
  email: string;
  password: string;
  phone?: string;
  roleSelection: 'LANDLORD' | 'DEVELOPER';
}

export interface LandlordPropertyDetailsInput {
  propertyType: string;
  yearBuilt: number;
  totalUnits: number;
  sqFootage?: number;
  country: string;
  stateOrProvince: string;
  city: string;
  address: string;
  zipCode: string;
  estimatedPropertyValue: number;
}

export interface LandlordProgramSelectionInput {
  programSelection: 'RPA_ONLY' | 'TEPA_ONLY' | 'RPA_TEPA';
  applyToAllUnits: boolean;
  notes?: string;
}

type ProgramSelection = 'RPA_ONLY' | 'TEPA_ONLY' | 'RPA_TEPA';
type ComplianceProfile = 'RPA_LIGHT' | 'FULL_DOCUMENT_VERIFICATION';
type ParticipationPace = (typeof PARTICIPATION_PACE_VALUES)[number];
type LandlordBuybackOption = (typeof LANDLORD_BUYBACK_OPTION_VALUES)[number];
type ThirdPartyInvestorRule = (typeof THIRD_PARTY_INVESTOR_RULE_VALUES)[number];
type TenantRentIncreaseCap = (typeof TENANT_RENT_INCREASE_CAP_VALUES)[number];

interface LandlordProgramEconomicsEligibleBehaviorsInput {
  onTimeRentPayment: boolean;
  lengthOfTenancy: boolean;
  leaseRenewal: boolean;
  goodStandingNoViolations: boolean;
}

export interface LandlordProgramEconomicsRulesInput {
  tenantEconomicParticipationPool: number | string;
  eligibleBehaviors: LandlordProgramEconomicsEligibleBehaviorsInput;
  participationPace: string;
  landlordBuybackOption: string;
  thirdPartyInvestorRules: string;
  tenantRentIncreaseCap: string;
  notes?: string;
}

export interface LandlordFrameworkAcknowledgementInput {
  noOwnershipTransferAcknowledged?: boolean;
  understandsNoOwnershipTransfer?: boolean;
  ownershipRightsAcknowledged?: boolean;
  acknowledgement?: boolean;
  notes?: string;
}

export interface LandlordComplianceAcknowledgementsInput {
  acknowledgements?: Record<string, unknown>;
  agreeAndContinue?: boolean;
  allAcknowledged?: boolean;
  notes?: string;
  [key: string]: unknown;
}

export interface LandlordReviewActivateInput {
  certificationAccepted?: boolean;
  certifyAndActivate?: boolean;
  certifyAccuracyAndAuthority?: boolean;
  understandsNoTitleTransfer?: boolean;
  statementAcknowledged?: boolean;
  certification?: {
    accepted?: boolean;
  };
  notes?: string;
  [key: string]: unknown;
}

interface LandlordOwnerDeedInput {
  inputMode?: 'manual' | 'upload';
  uploadedDocumentIds?: string[];
  legalOwnerName?: string;
  ownershipType?: string;
  countryOfFormation?: string;
  stateOfFormation?: string;
  tinVat?: string;
  operatingAgreementOnFile?: boolean;
  authorizedSignatoryName?: string;
  authorizedSignatoryTitle?: string;
  deedType?: string;
  recordingDate?: string;
  titleCompany?: string;
  titleInsuranceInPlace?: boolean;
  anyCoOwners?: boolean;
}

interface LandlordMortgageInput {
  inputMode?: 'manual' | 'upload';
  uploadedDocumentIds?: string[];
  hasLender?: boolean;
  lenderName?: string;
  loanType?: string;
  maturityDate?: string;
}

interface LandlordInsuranceInput {
  inputMode?: 'manual' | 'upload';
  uploadedDocumentIds?: string[];
  carrier?: string;
  provider?: string;
  policyNumber?: string;
  policyType?: string;
  effectiveDate?: string;
  expirationDate?: string;
  dwellingCoverage?: number;
  personalPropertyCoverage?: number;
  liabilityCoverage?: number;
  lossOfRentCoverage?: number;
  deductible?: number;
  floodInsurance?: boolean;
  earthquakeInsurance?: boolean;
  umbrellaPolicy?: boolean;
  namedInsuredMatchesDeed?: boolean;
  additionalInsured?: string;
  mortgageeListed?: boolean;
  claimsPast5Years?: boolean;
  openClaims?: boolean;
}

interface LandlordRpaComplianceInput {
  legalOwnerName?: string;
  ownershipType?: string;
  countryOfFormation?: string;
  stateOfFormation?: string;
  tinVat?: string;
  riskAttestation?: {
    noActiveCodeViolations?: boolean;
    noPendingHousingLitigation?: boolean;
  };
}

export interface LandlordComplianceDocumentsInput {
  ownerDeed?: LandlordOwnerDeedInput;
  mortgage?: LandlordMortgageInput;
  insurance?: LandlordInsuranceInput;
  rpaCompliance?: LandlordRpaComplianceInput;
  notes?: string;
}

interface ComplianceContext {
  programSelection: ProgramSelection;
  profile: ComplianceProfile;
  title: string;
  requiredSections: string[];
}

function ensureLandlord(user: any) {
  if (!user) {
    throw new AppError('Authentication required', 401);
  }

  if (user.role !== 'LANDLORD') {
    throw new AppError('Landlord only endpoint', 403);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasAtLeastOneUploadedDocument(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((entry) => typeof entry === 'string' && entry.trim().length > 0)
  );
}

function normalizeRuleValue(value: unknown): string {
  if (!isNonEmptyString(value)) {
    return '';
  }

  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function parseEnumValue<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  fieldName: string,
  aliases: Partial<Record<string, T>> = {}
): T {
  const normalized = normalizeRuleValue(value);
  const aliasMatch = aliases[normalized];
  if (aliasMatch) {
    return aliasMatch;
  }

  const match = allowedValues.find((allowed) => allowed === normalized);
  if (!match) {
    throw new AppError(
      `${fieldName} must be one of: ${allowedValues.join(', ')}`,
      400
    );
  }

  return match;
}

function parseNumericPercentage(value: unknown, fieldName: string): number {
  const numericValue =
    typeof value === 'number' ? value : isNonEmptyString(value) ? Number(value) : NaN;

  if (!Number.isFinite(numericValue)) {
    throw new AppError(`${fieldName} must be a valid number`, 400);
  }

  if (numericValue <= 0 || numericValue > 100) {
    throw new AppError(`${fieldName} must be greater than 0 and at most 100`, 400);
  }

  return Number(numericValue.toFixed(2));
}

function parseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new AppError(`${fieldName} must be a boolean`, 400);
  }

  return value;
}

function buildProgramEconomicsRulesPayload(
  input: LandlordProgramEconomicsRulesInput
) {
  const eligibleBehaviors = (input.eligibleBehaviors ??
    {}) as Partial<LandlordProgramEconomicsEligibleBehaviorsInput>;

  const onTimeRentPayment = parseBoolean(
    eligibleBehaviors.onTimeRentPayment,
    'eligibleBehaviors.onTimeRentPayment'
  );
  if (!onTimeRentPayment) {
    throw new AppError(
      'eligibleBehaviors.onTimeRentPayment must be true for participation eligibility',
      400
    );
  }

  return {
    tenantEconomicParticipationPool: parseNumericPercentage(
      input.tenantEconomicParticipationPool,
      'tenantEconomicParticipationPool'
    ),
    eligibleBehaviors: {
      onTimeRentPayment: true,
      lengthOfTenancy: parseBoolean(
        eligibleBehaviors.lengthOfTenancy,
        'eligibleBehaviors.lengthOfTenancy'
      ),
      leaseRenewal: parseBoolean(
        eligibleBehaviors.leaseRenewal,
        'eligibleBehaviors.leaseRenewal'
      ),
      goodStandingNoViolations: parseBoolean(
        eligibleBehaviors.goodStandingNoViolations,
        'eligibleBehaviors.goodStandingNoViolations'
      ),
    },
    participationPace: parseEnumValue<ParticipationPace>(
      input.participationPace,
      PARTICIPATION_PACE_VALUES,
      'participationPace',
      PARTICIPATION_PACE_ALIASES
    ),
    landlordBuybackOption: parseEnumValue<LandlordBuybackOption>(
      input.landlordBuybackOption,
      LANDLORD_BUYBACK_OPTION_VALUES,
      'landlordBuybackOption',
      LANDLORD_BUYBACK_OPTION_ALIASES
    ),
    thirdPartyInvestorRules: parseEnumValue<ThirdPartyInvestorRule>(
      input.thirdPartyInvestorRules,
      THIRD_PARTY_INVESTOR_RULE_VALUES,
      'thirdPartyInvestorRules',
      THIRD_PARTY_INVESTOR_RULE_ALIASES
    ),
    tenantRentIncreaseCap: parseEnumValue<TenantRentIncreaseCap>(
      input.tenantRentIncreaseCap,
      TENANT_RENT_INCREASE_CAP_VALUES,
      'tenantRentIncreaseCap',
      TENANT_RENT_INCREASE_CAP_ALIASES
    ),
    notes: input.notes?.trim() || null,
  };
}

function resolveFrameworkAcknowledgementFlag(
  input: LandlordFrameworkAcknowledgementInput
): boolean {
  const candidates = [
    input.noOwnershipTransferAcknowledged,
    input.understandsNoOwnershipTransfer,
    input.ownershipRightsAcknowledged,
    input.acknowledgement,
  ];

  return candidates.some((value) => value === true);
}

function getFirstBooleanValue(
  source: Record<string, unknown>,
  candidateKeys: string[]
): boolean | undefined {
  for (const candidateKey of candidateKeys) {
    if (typeof source[candidateKey] === 'boolean') {
      return source[candidateKey] as boolean;
    }
  }

  return undefined;
}

function buildComplianceAcknowledgementsPayload(
  input: LandlordComplianceAcknowledgementsInput
) {
  const root = input as Record<string, unknown>;
  const nested = ((input.acknowledgements ?? {}) as Record<string, unknown>) ?? {};
  const quickAgree = root.agreeAndContinue === true || root.allAcknowledged === true;

  const rewardsParticipationAgreementAndTenantProtections = quickAgree
    ? true
    : (getFirstBooleanValue(root, [
        'rewardsParticipationAgreementAndTenantProtections',
        'rewardsParticipationAgreementAcknowledged',
        'rewardsParticipationAcknowledged',
      ]) ??
      getFirstBooleanValue(nested, [
        'rewardsParticipationAgreementAndTenantProtections',
        'rewardsParticipationAgreementAcknowledged',
        'rewardsParticipationAcknowledged',
      ]) ??
      false);

  const tepaOptionalAndProgramRules = quickAgree
    ? true
    : (getFirstBooleanValue(root, [
        'tepaOptionalAndProgramRules',
        'tepaOptionalAndFollowsProgramRules',
        'tepaOptionalAcknowledged',
      ]) ??
      getFirstBooleanValue(nested, [
        'tepaOptionalAndProgramRules',
        'tepaOptionalAndFollowsProgramRules',
        'tepaOptionalAcknowledged',
      ]) ??
      false);

  const aggregateDataAnonymizedNoPii = quickAgree
    ? true
    : (getFirstBooleanValue(root, [
        'aggregateDataAnonymizedNoPii',
        'aggregateDataSharedAnonymizedNoPii',
        'dataPrivacyAcknowledged',
      ]) ??
      getFirstBooleanValue(nested, [
        'aggregateDataAnonymizedNoPii',
        'aggregateDataSharedAnonymizedNoPii',
        'dataPrivacyAcknowledged',
      ]) ??
      false);

  const exitAndOptOutProceduresReviewed = quickAgree
    ? true
    : (getFirstBooleanValue(root, [
        'exitAndOptOutProceduresReviewed',
        'exitAndOptOutAcknowledged',
        'exitProceduresAcknowledged',
      ]) ??
      getFirstBooleanValue(nested, [
        'exitAndOptOutProceduresReviewed',
        'exitAndOptOutAcknowledged',
        'exitProceduresAcknowledged',
      ]) ??
      false);

  const missing: string[] = [];
  if (!rewardsParticipationAgreementAndTenantProtections) {
    missing.push('rewardsParticipationAgreementAndTenantProtections');
  }
  if (!tepaOptionalAndProgramRules) {
    missing.push('tepaOptionalAndProgramRules');
  }
  if (!aggregateDataAnonymizedNoPii) {
    missing.push('aggregateDataAnonymizedNoPii');
  }
  if (!exitAndOptOutProceduresReviewed) {
    missing.push('exitAndOptOutProceduresReviewed');
  }

  if (missing.length > 0) {
    throw new AppError(
      `All compliance acknowledgements must be accepted. Missing: ${missing.join(', ')}`,
      400
    );
  }

  return {
    acknowledgements: {
      rewardsParticipationAgreementAndTenantProtections: true,
      tepaOptionalAndProgramRules: true,
      aggregateDataAnonymizedNoPii: true,
      exitAndOptOutProceduresReviewed: true,
    },
    allAcknowledged: true,
    acknowledgedAt: new Date().toISOString(),
    notes: isNonEmptyString(input.notes) ? input.notes.trim() : null,
  };
}

function getMissingFinalSteps(completedSteps: string[]): string[] {
  return LANDLORD_FINAL_REQUIRED_STEPS.filter(
    (step) => !completedSteps.includes(step)
  );
}

function resolveReviewActivateCertificationFlag(
  input: LandlordReviewActivateInput
): boolean {
  const root = input as Record<string, unknown>;
  const nested = (input.certification ?? {}) as Record<string, unknown>;

  const candidates = [
    input.certificationAccepted,
    input.certifyAndActivate,
    input.certifyAccuracyAndAuthority,
    input.understandsNoTitleTransfer,
    input.statementAcknowledged,
    root.agreeAndActivate,
    root.activateProgram,
    root.certify,
    nested.accepted,
  ];

  return candidates.some((value) => value === true);
}

function formatRuleLabel(value: unknown): string | null {
  if (!isNonEmptyString(value)) {
    return null;
  }

  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildReviewActivateSummary(stepData: Record<string, unknown>) {
  const propertyDetails = (stepData[PROPERTY_DETAILS_STEP] ?? {}) as Record<
    string,
    unknown
  >;
  const programSelection = (stepData[PROGRAM_SELECTION_STEP] ?? {}) as Record<
    string,
    unknown
  >;
  const programEconomics = (stepData[PROGRAM_ECONOMICS_RULES_STEP] ??
    {}) as Record<string, unknown>;

  const propertyType = isNonEmptyString(propertyDetails.propertyType)
    ? propertyDetails.propertyType
    : null;
  const propertyAddress = isNonEmptyString(propertyDetails.address)
    ? propertyDetails.address
    : null;
  const propertyNameRaw = propertyDetails.propertyName;
  const propertyName = isNonEmptyString(propertyNameRaw)
    ? propertyNameRaw
    : propertyAddress;
  const units =
    typeof propertyDetails.totalUnits === 'number'
      ? propertyDetails.totalUnits
      : null;

  const programCode = isNonEmptyString(programSelection.programSelection)
    ? programSelection.programSelection
    : null;
  const programLabel = formatRuleLabel(programCode);
  const hasTepa = programCode === 'TEPA_ONLY' || programCode === 'RPA_TEPA';

  const participationBullets: string[] = [];
  if (programCode === 'RPA_ONLY') {
    participationBullets.push('Rewards Enabled');
  } else if (hasTepa) {
    participationBullets.push('Rewards + TEPA Enabled');
  }
  if (programEconomics && Object.keys(programEconomics).length > 0) {
    participationBullets.push('Incentives listed');
  }

  return {
    propertyOverview: {
      propertyName,
      units,
      type: propertyType,
      address: propertyAddress,
    },
    participationModel: {
      programSelection: programCode,
      programSelectionLabel: programLabel,
      hasTepa,
      bullets: participationBullets,
    },
    tepaConfiguration: {
      tenantEconomicParticipationPool:
        typeof programEconomics.tenantEconomicParticipationPool === 'number'
          ? programEconomics.tenantEconomicParticipationPool
          : null,
      landlordBuybackOption: programEconomics.landlordBuybackOption ?? null,
      landlordBuybackOptionLabel: formatRuleLabel(
        programEconomics.landlordBuybackOption
      ),
      thirdPartyInvestorRules: programEconomics.thirdPartyInvestorRules ?? null,
      thirdPartyInvestorRulesLabel: formatRuleLabel(
        programEconomics.thirdPartyInvestorRules
      ),
      participationPace: programEconomics.participationPace ?? null,
      participationPaceLabel: formatRuleLabel(programEconomics.participationPace),
    },
    whatHappensNext: [
      'Tenants receive invitations',
      'Compliance monitoring begins',
      'Dashboard access granted',
    ],
  };
}

function getComplianceContext(state: any): ComplianceContext {
  const stepData = (state?.stepData ?? {}) as Record<string, unknown>;
  const programData = stepData[PROGRAM_SELECTION_STEP] as
    | { programSelection?: ProgramSelection }
    | undefined;

  const programSelection = programData?.programSelection;
  if (!programSelection) {
    throw new AppError(
      'Program selection is required before compliance step',
      400
    );
  }

  if (programSelection === 'RPA_ONLY') {
    return {
      programSelection,
      profile: 'RPA_LIGHT',
      title: 'RPA Compliance',
      requiredSections: ['rpaCompliance'],
    };
  }

  return {
    programSelection,
    profile: 'FULL_DOCUMENT_VERIFICATION',
    title: 'Document Verification',
    requiredSections: ['ownerDeed', 'mortgage', 'insurance'],
  };
}

function mergeCompliancePayload(
  existing: Record<string, unknown>,
  incoming: LandlordComplianceDocumentsInput
): Record<string, unknown> {
  const safeExisting = existing ?? {};

  return {
    ...safeExisting,
    ...incoming,
    ownerDeed: {
      ...((safeExisting.ownerDeed as Record<string, unknown>) ?? {}),
      ...(incoming.ownerDeed ?? {}),
    },
    mortgage: {
      ...((safeExisting.mortgage as Record<string, unknown>) ?? {}),
      ...(incoming.mortgage ?? {}),
    },
    insurance: {
      ...((safeExisting.insurance as Record<string, unknown>) ?? {}),
      ...(incoming.insurance ?? {}),
    },
    rpaCompliance: {
      ...((safeExisting.rpaCompliance as Record<string, unknown>) ?? {}),
      ...(incoming.rpaCompliance ?? {}),
      riskAttestation: {
        ...(((safeExisting.rpaCompliance as Record<string, unknown> | undefined)
          ?.riskAttestation as Record<string, unknown>) ?? {}),
        ...(incoming.rpaCompliance?.riskAttestation ?? {}),
      },
    },
    notes:
      incoming.notes !== undefined
        ? incoming.notes?.trim() || null
        : safeExisting.notes ?? null,
  };
}

function assessRpaComplianceCompleteness(
  payload: Record<string, unknown>
): string[] {
  const section = (payload.rpaCompliance ?? {}) as Record<string, unknown>;
  const risk = (section.riskAttestation ?? {}) as Record<string, unknown>;
  const missing: string[] = [];

  if (!isNonEmptyString(section.legalOwnerName)) {
    missing.push('rpaCompliance.legalOwnerName');
  }
  if (!isNonEmptyString(section.ownershipType)) {
    missing.push('rpaCompliance.ownershipType');
  }
  if (!isNonEmptyString(section.countryOfFormation)) {
    missing.push('rpaCompliance.countryOfFormation');
  }
  if (!isNonEmptyString(section.stateOfFormation)) {
    missing.push('rpaCompliance.stateOfFormation');
  }
  if (typeof risk.noActiveCodeViolations !== 'boolean') {
    missing.push('rpaCompliance.riskAttestation.noActiveCodeViolations');
  }
  if (typeof risk.noPendingHousingLitigation !== 'boolean') {
    missing.push('rpaCompliance.riskAttestation.noPendingHousingLitigation');
  }

  return missing;
}

function assessOwnerDeedCompleteness(payload: Record<string, unknown>): string[] {
  const section = (payload.ownerDeed ?? {}) as Record<string, unknown>;
  const mode = section.inputMode === 'upload' ? 'upload' : 'manual';
  const missing: string[] = [];

  if (mode === 'upload') {
    if (!hasAtLeastOneUploadedDocument(section.uploadedDocumentIds)) {
      missing.push('ownerDeed.uploadedDocumentIds');
    }
    return missing;
  }

  if (!isNonEmptyString(section.legalOwnerName)) missing.push('ownerDeed.legalOwnerName');
  if (!isNonEmptyString(section.ownershipType)) missing.push('ownerDeed.ownershipType');
  if (!isNonEmptyString(section.countryOfFormation)) missing.push('ownerDeed.countryOfFormation');
  if (!isNonEmptyString(section.stateOfFormation)) missing.push('ownerDeed.stateOfFormation');
  if (!isNonEmptyString(section.authorizedSignatoryName)) missing.push('ownerDeed.authorizedSignatoryName');
  if (!isNonEmptyString(section.authorizedSignatoryTitle)) missing.push('ownerDeed.authorizedSignatoryTitle');
  if (!isNonEmptyString(section.deedType)) missing.push('ownerDeed.deedType');
  if (!isNonEmptyString(section.recordingDate)) missing.push('ownerDeed.recordingDate');
  if (typeof section.titleInsuranceInPlace !== 'boolean') missing.push('ownerDeed.titleInsuranceInPlace');
  if (typeof section.anyCoOwners !== 'boolean') missing.push('ownerDeed.anyCoOwners');

  return missing;
}

function assessMortgageCompleteness(payload: Record<string, unknown>): string[] {
  const section = (payload.mortgage ?? {}) as Record<string, unknown>;
  const mode = section.inputMode === 'upload' ? 'upload' : 'manual';
  const missing: string[] = [];

  if (mode === 'upload') {
    if (!hasAtLeastOneUploadedDocument(section.uploadedDocumentIds)) {
      missing.push('mortgage.uploadedDocumentIds');
    }
    return missing;
  }

  if (typeof section.hasLender !== 'boolean') {
    missing.push('mortgage.hasLender');
  } else if (section.hasLender === true && !isNonEmptyString(section.lenderName)) {
    missing.push('mortgage.lenderName');
  }

  return missing;
}

function assessInsuranceCompleteness(payload: Record<string, unknown>): string[] {
  const section = (payload.insurance ?? {}) as Record<string, unknown>;
  const mode = section.inputMode === 'upload' ? 'upload' : 'manual';
  const missing: string[] = [];

  if (mode === 'upload') {
    if (!hasAtLeastOneUploadedDocument(section.uploadedDocumentIds)) {
      missing.push('insurance.uploadedDocumentIds');
    }
    return missing;
  }

  if (!isNonEmptyString(section.carrier)) missing.push('insurance.carrier');
  if (!isNonEmptyString(section.provider)) missing.push('insurance.provider');
  if (!isNonEmptyString(section.policyNumber)) missing.push('insurance.policyNumber');
  if (!isNonEmptyString(section.policyType)) missing.push('insurance.policyType');
  if (!isNonEmptyString(section.effectiveDate)) missing.push('insurance.effectiveDate');
  if (!isNonEmptyString(section.expirationDate)) missing.push('insurance.expirationDate');
  if (typeof section.dwellingCoverage !== 'number') missing.push('insurance.dwellingCoverage');
  if (typeof section.liabilityCoverage !== 'number') missing.push('insurance.liabilityCoverage');
  if (typeof section.lossOfRentCoverage !== 'number') missing.push('insurance.lossOfRentCoverage');
  if (typeof section.deductible !== 'number') missing.push('insurance.deductible');
  if (typeof section.namedInsuredMatchesDeed !== 'boolean') missing.push('insurance.namedInsuredMatchesDeed');
  if (typeof section.mortgageeListed !== 'boolean') missing.push('insurance.mortgageeListed');
  if (typeof section.claimsPast5Years !== 'boolean') missing.push('insurance.claimsPast5Years');
  if (typeof section.openClaims !== 'boolean') missing.push('insurance.openClaims');

  return missing;
}

function assessComplianceCompleteness(
  profile: ComplianceProfile,
  payload: Record<string, unknown>
): { isComplete: boolean; missingFields: string[] } {
  const missingFields =
    profile === 'RPA_LIGHT'
      ? assessRpaComplianceCompleteness(payload)
      : [
          ...assessOwnerDeedCompleteness(payload),
          ...assessMortgageCompleteness(payload),
          ...assessInsuranceCompleteness(payload),
        ];

  return {
    isComplete: missingFields.length === 0,
    missingFields,
  };
}

export async function createLandlordAccountFromInvite(
  input: CreateLandlordAccountInput
) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const invite = await assertLandlordRegistrationEligibility(
    input.onboardingToken,
    normalizedEmail
  );

  const passwordHash = await bcrypt.hash(input.password, 12);
  const existingUser = await User.findOne({ email: normalizedEmail }).exec();
  const profileAddress = `${invite.prefill.city}, ${invite.prefill.stateOrProvince}, ${invite.prefill.country}`;
  let user = existingUser;
  let createdNewUser = false;

  if (user) {
    if (user.role !== 'LANDLORD') {
      throw new AppError(
        'Email already registered with a different role. Use a different email for landlord onboarding',
        409
      );
    }

    user.phone = input.phone?.trim() || user.phone;
    user.passwordHash = passwordHash;
    user.status = 'PENDING';
    user.oauthProviders = user.oauthProviders ?? [];
    user.profile = {
      firstName: user.profile?.firstName || invite.prefill.firstName,
      lastName: user.profile?.lastName || invite.prefill.lastName,
      address: user.profile?.address || profileAddress,
    };

    await user.save();
  } else {
    createdNewUser = true;
    user = await User.create({
      email: normalizedEmail,
      phone: input.phone?.trim() || undefined,
      passwordHash,
      role: 'LANDLORD',
      status: 'PENDING',
      oauthProviders: [],
      profile: {
        firstName: invite.prefill.firstName,
        lastName: invite.prefill.lastName,
        address: profileAddress,
      },
    });
  }

  if (!user) {
    throw new AppError('Failed to create landlord account', 500);
  }

  try {
    await consumeLandlordInviteToken(
      input.onboardingToken,
      user._id as Types.ObjectId
    );
  } catch (consumeErr) {
    if (createdNewUser) {
      await User.deleteOne({ _id: user._id }).catch(() => undefined);
    }
    throw consumeErr;
  }

  const createAccountData = {
    roleSelection: input.roleSelection,
    email: normalizedEmail,
    interestId: invite.interestId,
  };

  await OnboardingState.findOneAndUpdate(
    { userId: user._id },
    {
      role: user.role,
      $set: {
        [`stepData.${CREATE_ACCOUNT_STEP}`]: createAccountData,
        updatedAt: new Date(),
      },
      $addToSet: { completedSteps: CREATE_ACCOUNT_STEP },
      status: 'IN_PROGRESS',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'LANDLORD_ONBOARDING_ACCOUNT_CREATED',
    entityType: 'User',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: createAccountData,
    },
  });

  await issueOtpForUser(user._id as Types.ObjectId, user.email, user.profile?.firstName ?? '');

  const token = generateJwt(user);
  return {
    token,
    user: {
      id: String(user._id),
      email: user.email,
      role: user.role,
      status: user.status,
      profile: user.profile ?? null,
    },
    reusedExistingAccount: !createdNewUser,
    nextStep: 'verify_email',
  };
}

export { verifyUserOtp as verifyLandlordOtp };

export async function saveLandlordPropertyDetails(
  user: any,
  input: LandlordPropertyDetailsInput
) {
  ensureLandlord(user);

  const payload = {
    propertyType: input.propertyType,
    yearBuilt: input.yearBuilt,
    totalUnits: input.totalUnits,
    sqFootage: input.sqFootage ?? null,
    country: input.country,
    stateOrProvince: input.stateOrProvince,
    city: input.city,
    address: input.address,
    zipCode: input.zipCode,
    estimatedPropertyValue: input.estimatedPropertyValue,
  };

  await OnboardingState.findOneAndUpdate(
    { userId: user._id },
    {
      role: user.role,
      $set: {
        [`stepData.${PROPERTY_DETAILS_STEP}`]: payload,
        updatedAt: new Date(),
      },
      $addToSet: { completedSteps: PROPERTY_DETAILS_STEP },
      status: 'IN_PROGRESS',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'LANDLORD_PROPERTY_DETAILS_SUBMITTED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: payload,
    },
  });

  return {
    message: 'Property details saved successfully',
    stepKey: PROPERTY_DETAILS_STEP,
    propertyDetails: payload,
  };
}

export async function getLandlordPropertyDetails(user: any) {
  ensureLandlord(user);

  const state = await OnboardingState.findOne({ userId: user._id }).lean().exec();
  const details = (state?.stepData as Record<string, unknown> | undefined)?.[
    PROPERTY_DETAILS_STEP
  ] as Record<string, unknown> | undefined;

  return {
    stepKey: PROPERTY_DETAILS_STEP,
    propertyDetails: details ?? null,
    completed: Boolean(state?.completedSteps?.includes(PROPERTY_DETAILS_STEP)),
  };
}

export async function saveLandlordProgramSelection(
  user: any,
  input: LandlordProgramSelectionInput
) {
  ensureLandlord(user);

  const payload = {
    programSelection: input.programSelection,
    applyToAllUnits: input.applyToAllUnits,
    notes: input.notes?.trim() || null,
  };

  await OnboardingState.findOneAndUpdate(
    { userId: user._id },
    {
      role: user.role,
      $set: {
        [`stepData.${PROGRAM_SELECTION_STEP}`]: payload,
        updatedAt: new Date(),
      },
      $addToSet: { completedSteps: PROGRAM_SELECTION_STEP },
      status: 'IN_PROGRESS',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'LANDLORD_PROGRAM_SELECTION_SUBMITTED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: payload,
    },
  });

  return {
    message: 'Program selection saved successfully',
    stepKey: PROGRAM_SELECTION_STEP,
    programSelection: payload,
  };
}

export async function getLandlordProgramSelection(user: any) {
  ensureLandlord(user);

  const state = await OnboardingState.findOne({ userId: user._id }).lean().exec();
  const selection = (state?.stepData as Record<string, unknown> | undefined)?.[
    PROGRAM_SELECTION_STEP
  ] as Record<string, unknown> | undefined;

  return {
    stepKey: PROGRAM_SELECTION_STEP,
    programSelection: selection ?? null,
    completed: Boolean(state?.completedSteps?.includes(PROGRAM_SELECTION_STEP)),
  };
}

export async function saveLandlordComplianceDocuments(
  user: any,
  input: LandlordComplianceDocumentsInput
) {
  ensureLandlord(user);

  const state =
    (await OnboardingState.findOne({ userId: user._id }).exec()) ??
    new OnboardingState({
      userId: user._id,
      role: user.role,
      completedSteps: [],
      stepData: {},
      documents: [],
      status: 'NOT_STARTED',
    });

  const complianceContext = getComplianceContext(state);
  const stepData = (state.stepData ?? {}) as Record<string, unknown>;
  const existingPayload = (stepData[COMPLIANCE_DOCUMENTS_STEP] ?? {}) as Record<
    string,
    unknown
  >;
  const mergedPayload = mergeCompliancePayload(existingPayload, input);

  const assessment = assessComplianceCompleteness(
    complianceContext.profile,
    mergedPayload
  );

  stepData[COMPLIANCE_DOCUMENTS_STEP] = mergedPayload;
  state.stepData = stepData;
  state.updatedAt = new Date();
  state.status = 'IN_PROGRESS';

  if (assessment.isComplete) {
    if (!state.completedSteps.includes(COMPLIANCE_DOCUMENTS_STEP)) {
      state.completedSteps.push(COMPLIANCE_DOCUMENTS_STEP);
    }
  } else {
    state.completedSteps = state.completedSteps.filter(
      (step) => step !== COMPLIANCE_DOCUMENTS_STEP
    );
  }

  await state.save();

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'LANDLORD_COMPLIANCE_DOCUMENTS_SAVED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        profile: complianceContext.profile,
        isComplete: assessment.isComplete,
        missingCount: assessment.missingFields.length,
      },
    },
  });

  return {
    message: 'Compliance & documents saved successfully',
    stepKey: COMPLIANCE_DOCUMENTS_STEP,
    profile: complianceContext.profile,
    programSelection: complianceContext.programSelection,
    requiredSections: complianceContext.requiredSections,
    complianceDocuments: mergedPayload,
    completed: assessment.isComplete,
    missingFields: assessment.missingFields,
  };
}

export async function getLandlordComplianceDocuments(user: any) {
  ensureLandlord(user);

  const state = await OnboardingState.findOne({ userId: user._id }).lean().exec();
  if (!state) {
    throw new AppError(
      'Program selection is required before compliance step',
      400
    );
  }

  const complianceContext = getComplianceContext(state);
  const stepData = (state.stepData ?? {}) as Record<string, unknown>;
  const payload = (stepData[COMPLIANCE_DOCUMENTS_STEP] ?? null) as
    | Record<string, unknown>
    | null;

  const assessment = payload
    ? assessComplianceCompleteness(complianceContext.profile, payload)
    : {
        isComplete: false,
        missingFields: complianceContext.requiredSections.map(
          (section) => `${section}.required`
        ),
      };

  return {
    stepKey: COMPLIANCE_DOCUMENTS_STEP,
    profile: complianceContext.profile,
    title: complianceContext.title,
    programSelection: complianceContext.programSelection,
    requiredSections: complianceContext.requiredSections,
    complianceDocuments: payload,
    completed: assessment.isComplete,
    missingFields: assessment.missingFields,
  };
}

export async function saveLandlordProgramEconomicsRules(
  user: any,
  input: LandlordProgramEconomicsRulesInput
) {
  ensureLandlord(user);
  const payload = buildProgramEconomicsRulesPayload(input);

  await OnboardingState.findOneAndUpdate(
    { userId: user._id },
    {
      role: user.role,
      $set: {
        [`stepData.${PROGRAM_ECONOMICS_RULES_STEP}`]: payload,
        updatedAt: new Date(),
      },
      $addToSet: { completedSteps: PROGRAM_ECONOMICS_RULES_STEP },
      status: 'IN_PROGRESS',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'LANDLORD_PROGRAM_ECONOMICS_RULES_SAVED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: PROGRAM_ECONOMICS_RULES_STEP,
        tenantEconomicParticipationPool: payload.tenantEconomicParticipationPool,
        participationPace: payload.participationPace,
      },
    },
  });

  return {
    message: 'Program economics & rules saved successfully',
    stepKey: PROGRAM_ECONOMICS_RULES_STEP,
    programEconomicsRules: payload,
    completed: true,
    nextStep: 'framework_acknowledgement',
  };
}

export async function getLandlordProgramEconomicsRules(user: any) {
  ensureLandlord(user);

  const state = await OnboardingState.findOne({ userId: user._id }).lean().exec();
  const payload = (state?.stepData as Record<string, unknown> | undefined)?.[
    PROGRAM_ECONOMICS_RULES_STEP
  ] as Record<string, unknown> | undefined;

  return {
    stepKey: PROGRAM_ECONOMICS_RULES_STEP,
    programEconomicsRules: payload ?? null,
    completed: Boolean(state?.completedSteps?.includes(PROGRAM_ECONOMICS_RULES_STEP)),
  };
}

export async function saveLandlordFrameworkAcknowledgement(
  user: any,
  input: LandlordFrameworkAcknowledgementInput
) {
  ensureLandlord(user);

  const acknowledged = resolveFrameworkAcknowledgementFlag(input);
  if (!acknowledged) {
    throw new AppError(
      'You must acknowledge that this program does not grant ownership, title, or property rights',
      400
    );
  }

  const payload = {
    noOwnershipTransferAcknowledged: true,
    acknowledgedAt: new Date().toISOString(),
    statementText: FRAMEWORK_ACKNOWLEDGEMENT_STATEMENT,
    notes: input.notes?.trim() || null,
  };

  await OnboardingState.findOneAndUpdate(
    { userId: user._id },
    {
      role: user.role,
      $set: {
        [`stepData.${FRAMEWORK_ACKNOWLEDGEMENT_STEP}`]: payload,
        updatedAt: new Date(),
      },
      $addToSet: { completedSteps: FRAMEWORK_ACKNOWLEDGEMENT_STEP },
      status: 'IN_PROGRESS',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'LANDLORD_FRAMEWORK_ACKNOWLEDGEMENT_SAVED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: FRAMEWORK_ACKNOWLEDGEMENT_STEP,
        noOwnershipTransferAcknowledged: true,
      },
    },
  });

  return {
    message: 'Framework acknowledgement saved successfully',
    stepKey: FRAMEWORK_ACKNOWLEDGEMENT_STEP,
    frameworkAcknowledgement: payload,
    completed: true,
    nextStep: 'compliance_acknowledgements',
  };
}

export async function getLandlordFrameworkAcknowledgement(user: any) {
  ensureLandlord(user);

  const state = await OnboardingState.findOne({ userId: user._id }).lean().exec();
  const payload = (state?.stepData as Record<string, unknown> | undefined)?.[
    FRAMEWORK_ACKNOWLEDGEMENT_STEP
  ] as Record<string, unknown> | undefined;

  return {
    stepKey: FRAMEWORK_ACKNOWLEDGEMENT_STEP,
    requiredStatement: FRAMEWORK_ACKNOWLEDGEMENT_STATEMENT,
    frameworkAcknowledgement: payload ?? null,
    completed: Boolean(state?.completedSteps?.includes(FRAMEWORK_ACKNOWLEDGEMENT_STEP)),
  };
}

export async function saveLandlordComplianceAcknowledgements(
  user: any,
  input: LandlordComplianceAcknowledgementsInput
) {
  ensureLandlord(user);
  const payload = buildComplianceAcknowledgementsPayload(input);

  await OnboardingState.findOneAndUpdate(
    { userId: user._id },
    {
      role: user.role,
      $set: {
        [`stepData.${COMPLIANCE_ACKNOWLEDGEMENTS_STEP}`]: payload,
        updatedAt: new Date(),
      },
      $addToSet: { completedSteps: COMPLIANCE_ACKNOWLEDGEMENTS_STEP },
      status: 'IN_PROGRESS',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'LANDLORD_COMPLIANCE_ACKNOWLEDGEMENTS_SAVED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: COMPLIANCE_ACKNOWLEDGEMENTS_STEP,
        allAcknowledged: true,
      },
    },
  });

  return {
    message: 'Compliance acknowledgements saved successfully',
    stepKey: COMPLIANCE_ACKNOWLEDGEMENTS_STEP,
    complianceAcknowledgements: payload,
    completed: true,
    nextStep: 'review_activate',
  };
}

export async function getLandlordComplianceAcknowledgements(user: any) {
  ensureLandlord(user);

  const state = await OnboardingState.findOne({ userId: user._id }).lean().exec();
  const payload = (state?.stepData as Record<string, unknown> | undefined)?.[
    COMPLIANCE_ACKNOWLEDGEMENTS_STEP
  ] as Record<string, unknown> | undefined;

  return {
    stepKey: COMPLIANCE_ACKNOWLEDGEMENTS_STEP,
    requiredAcknowledgements: COMPLIANCE_ACKNOWLEDGEMENTS_REQUIRED_ITEMS,
    complianceAcknowledgements: payload ?? null,
    completed: Boolean(state?.completedSteps?.includes(COMPLIANCE_ACKNOWLEDGEMENTS_STEP)),
  };
}

export async function getLandlordReviewActivate(user: any) {
  ensureLandlord(user);

  const state = await OnboardingState.findOne({ userId: user._id }).lean().exec();
  const stepData = (state?.stepData ?? {}) as Record<string, unknown>;
  const completedSteps = state?.completedSteps ?? [];
  const missingSteps = getMissingFinalSteps(completedSteps);
  const payload = (stepData[REVIEW_ACTIVATE_STEP] ?? null) as
    | Record<string, unknown>
    | null;

  return {
    stepKey: REVIEW_ACTIVATE_STEP,
    reviewSummary: buildReviewActivateSummary(stepData),
    requiredCertificationStatement: REVIEW_ACTIVATE_CERTIFICATION_STATEMENT,
    requiredSteps: [...LANDLORD_FINAL_REQUIRED_STEPS],
    completedSteps,
    missingSteps,
    readyForActivation: missingSteps.length === 0,
    reviewActivate: payload,
    completed: Boolean(state?.completedSteps?.includes(REVIEW_ACTIVATE_STEP)),
  };
}

function mapPropertyType(raw: string): 'SFR' | 'MF' | 'BTR' | 'Condo' | 'Other' {
  const lower = raw.toLowerCase();
  if (lower.includes('single family')) return 'SFR';
  if (lower.includes('multifamily') || lower.includes('multi-family') || lower.includes('multi family')) return 'MF';
  if (lower.includes('build to rent') || lower.includes('btr')) return 'BTR';
  if (lower.includes('condo')) return 'Condo';
  return 'Other';
}

async function promoteOnboardingToDomainCollections(
  user: any,
  stepData: Record<string, unknown>
): Promise<void> {
  const propertyDetails = (stepData[PROPERTY_DETAILS_STEP] ?? {}) as Record<string, unknown>;
  const programSelection = (stepData[PROGRAM_SELECTION_STEP] ?? {}) as Record<string, unknown>;
  const complianceDocs = (stepData[COMPLIANCE_DOCUMENTS_STEP] ?? {}) as Record<string, unknown>;

  // Resolve org name from compliance docs (owner deed or rpa compliance) or user profile
  const ownerSection = (complianceDocs.ownerDeed ?? complianceDocs.rpaCompliance ?? {}) as Record<string, unknown>;
  const orgName = isNonEmptyString(ownerSection.legalOwnerName)
    ? (ownerSection.legalOwnerName as string)
    : `${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim() || user.email;

  // Idempotent: reuse existing org if already created for this landlord
  let org = await Organization.findOne({ primaryContactUserId: user._id }).exec();
  if (!org) {
    org = await Organization.create({
      type: 'LANDLORD_ORG',
      name: orgName,
      primaryContactUserId: user._id,
    });
  }

  // Idempotent: upsert membership so running review_activate twice is safe
  await Membership.findOneAndUpdate(
    { userId: user._id, orgId: org._id },
    { $set: { roleInOrg: 'OWNER', status: 'active' } },
    { upsert: true, setDefaultsOnInsert: true }
  );

  // Map program selection to Property.participationModel
  const rawProgram = isNonEmptyString(programSelection.programSelection)
    ? (programSelection.programSelection as string)
    : 'RPA_ONLY';
  const participationModel: 'RPA_ONLY' | 'TEPA_ONLY' | 'BOTH' =
    rawProgram === 'RPA_TEPA' ? 'BOTH' : (rawProgram as 'RPA_ONLY' | 'TEPA_ONLY' | 'BOTH');

  const rawPropertyType = isNonEmptyString(propertyDetails.propertyType)
    ? (propertyDetails.propertyType as string)
    : '';

  // Idempotent: reuse existing property for this org
  let property = await PropertyModel.findOne({ orgId: org._id }).exec();
  if (!property) {
    // Auto-generate a unique slug — the properties.slug unique index is not
    // reliably sparse in every environment, so leaving it unset collides
    // with any other property that also has none (E11000 on slug: null).
    const slug = `${orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
    property = await PropertyModel.create({
      orgId: org._id,
      name: orgName,
      slug,
      address: {
        line1: isNonEmptyString(propertyDetails.address) ? (propertyDetails.address as string) : 'Unknown',
        city: isNonEmptyString(propertyDetails.city) ? (propertyDetails.city as string) : 'Unknown',
        state: isNonEmptyString(propertyDetails.stateOrProvince) ? (propertyDetails.stateOrProvince as string) : 'Unknown',
        postalCode: isNonEmptyString(propertyDetails.zipCode) ? (propertyDetails.zipCode as string) : '00000',
        country: isNonEmptyString(propertyDetails.country) ? (propertyDetails.country as string) : 'US',
      },
      type: mapPropertyType(rawPropertyType),
      participationModel,
      status: 'ONBOARDING',
      activationStatus: 'ACTIVE',
      onboardingStatus: 'COMPLETE',
      riskStatus: 'LOW',
      yearBuilt: typeof propertyDetails.yearBuilt === 'number' ? propertyDetails.yearBuilt : undefined,
      totalUnits: typeof propertyDetails.totalUnits === 'number' ? propertyDetails.totalUnits : undefined,
      estimatedPropertyValue: typeof propertyDetails.estimatedPropertyValue === 'number' ? propertyDetails.estimatedPropertyValue : undefined,
      tokenizedPct: 0,
      integrationStatus: 'NONE',
    });
  }

  // Create placeholder units only if none exist yet for this property
  const totalUnits = typeof propertyDetails.totalUnits === 'number' ? propertyDetails.totalUnits : 0;
  if (totalUnits > 0) {
    const existingCount = await UnitModel.countDocuments({ propertyId: property._id }).exec();
    if (existingCount === 0) {
      const unitDocs = Array.from({ length: Math.min(totalUnits, 500) }, (_, i) => ({
        propertyId: property!._id,
        unitNumber: String(i + 1),
        bedrooms: 0,
        bathrooms: 0,
        rent: 0,
        status: 'VACANT' as const,
      }));
      await UnitModel.insertMany(unitDocs, { ordered: false });
    }
  }
}

export async function saveLandlordReviewActivate(
  user: any,
  input: LandlordReviewActivateInput
) {
  ensureLandlord(user);

  const state = await OnboardingState.findOne({ userId: user._id }).exec();
  if (!state) {
    throw new AppError(
      'Complete onboarding steps before activating the program',
      400
    );
  }

  const missingSteps = getMissingFinalSteps(state.completedSteps ?? []);
  if (missingSteps.length > 0) {
    throw new AppError(
      `Cannot activate yet. Complete required steps: ${missingSteps.join(', ')}`,
      400
    );
  }

  const certificationAccepted = resolveReviewActivateCertificationFlag(input);
  if (!certificationAccepted) {
    throw new AppError(
      'Certification is required before activating the program',
      400
    );
  }

  const payload = {
    certificationAccepted: true,
    statementText: REVIEW_ACTIVATE_CERTIFICATION_STATEMENT,
    acknowledgedAt: new Date().toISOString(),
    notes: isNonEmptyString(input.notes) ? input.notes.trim() : null,
  };

  const stepData = (state.stepData ?? {}) as Record<string, unknown>;
  stepData[REVIEW_ACTIVATE_STEP] = payload;
  state.stepData = stepData;

  if (!state.completedSteps.includes(REVIEW_ACTIVATE_STEP)) {
    state.completedSteps.push(REVIEW_ACTIVATE_STEP);
  }

  state.status = 'COMPLETE';
  state.updatedAt = new Date();
  await state.save();

  await User.findByIdAndUpdate(user._id, { $set: { status: 'ACTIVE' } }).exec();

  await promoteOnboardingToDomainCollections(user, stepData);

  await writeAuditEvent({
    actorUserId: user._id as Types.ObjectId,
    action: 'LANDLORD_REVIEW_ACTIVATE_COMPLETED',
    entityType: 'OnboardingState',
    entityId: user._id as Types.ObjectId,
    diff: {
      before: null,
      after: {
        stepKey: REVIEW_ACTIVATE_STEP,
        status: 'COMPLETE',
      },
    },
  });

  const freshToken = generateJwt({ _id: user._id, email: user.email, role: user.role });
  const freshRefreshToken = generateRefreshJwt({ _id: user._id });

  return {
    message: 'Program activated successfully',
    stepKey: REVIEW_ACTIVATE_STEP,
    reviewActivate: payload,
    completed: true,
    onboardingStatus: 'COMPLETE',
    nextStep: null,
    token: freshToken,
    refreshToken: freshRefreshToken,
    user: {
      id: (user._id as Types.ObjectId).toString(),
      email: user.email as string,
      role: user.role as string,
      status: 'ACTIVE'
    }
  };
}

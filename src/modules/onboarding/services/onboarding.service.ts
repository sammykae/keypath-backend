import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { isDemoModeEnabled } from '../../../core/utils/demo.utils';
import { Membership } from '../../orgs/models/membership.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { OnboardingState } from '../models/onboarding-state.model';
import { User } from '../../auth/models/user.model';
import { writeAuditEvent } from '../../audit/services/audit.service';

type SupportedRole =
  | 'TENANT'
  | 'LANDLORD'
  | 'COMMUNITY'
  | 'COMMUNITY_STAKEHOLDER'
  | 'INVESTOR'
  | 'ADMIN';

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

interface SubmitStepInput {
  stepKey: string;
  payload?: Record<string, unknown>;
}

interface UploadDocInput {
  stepKey: string;
  documentType: string;
  fileUrl: string;
  fileName?: string;
}

interface VerifyDocInput {
  userId: string;
  documentId: string;
  decision: 'VERIFIED' | 'REJECTED';
  rejectionReason?: string;
}

// Codex: required step matrix for all primary roles in ONB flow.
const TENANT_CREATE_ACCOUNT_STEP = 'create_account';
const TENANT_IDENTITY_VERIFICATION_STEP = 'identity_verification';
const TENANT_LEASE_ASSOCIATION_STEP = 'lease_association';
const TENANT_PROGRAM_EXPLANATION_STEP = 'program_explanation';
const TENANT_PARTICIPATION_STATUS_STEP = 'participation_status';
const TENANT_DASHBOARD_WALKTHROUGH_STEP = 'dashboard_walkthrough';
const COMMUNITY_CREATE_ACCOUNT_STEP = 'create_account';
const COMMUNITY_ORGANIZATION_INFORMATION_STEP = 'organization_information';
const COMMUNITY_STAKEHOLDER_TYPE_STEP = 'stakeholder_type';
const COMMUNITY_PROGRAM_ASSOCIATION_STEP = 'program_association';
const COMMUNITY_DATA_VISIBILITY_PRIVACY_STEP = 'data_visibility_privacy';
const COMMUNITY_IMPACT_GOALS_STEP = 'impact_goals';
const COMMUNITY_REVIEW_ACTIVATE_STEP = 'review_activate';
const INVESTOR_CREATE_ACCOUNT_STEP = 'create_account';
const INVESTOR_STATUS_ACKNOWLEDGMENT_STEP = 'investor_status_acknowledgment';
const INVESTMENT_PREFERENCES_STEP = 'investment_preferences';
const LEGAL_ACKNOWLEDGMENTS_STEP = 'legal_acknowledgments';
const INVESTOR_ALL_SET_STEP = 'all_set';

const REQUIRED_STEPS_BY_ROLE: Record<SupportedRole, string[]> = {
  TENANT: [
    TENANT_CREATE_ACCOUNT_STEP,
    TENANT_IDENTITY_VERIFICATION_STEP,
    TENANT_LEASE_ASSOCIATION_STEP,
    TENANT_PROGRAM_EXPLANATION_STEP,
    TENANT_PARTICIPATION_STATUS_STEP,
    TENANT_DASHBOARD_WALKTHROUGH_STEP,
  ],
  LANDLORD: ['profile_complete', 'org_joined'],
  COMMUNITY: [
    COMMUNITY_CREATE_ACCOUNT_STEP,
    COMMUNITY_ORGANIZATION_INFORMATION_STEP,
    COMMUNITY_STAKEHOLDER_TYPE_STEP,
    COMMUNITY_PROGRAM_ASSOCIATION_STEP,
    COMMUNITY_DATA_VISIBILITY_PRIVACY_STEP,
    COMMUNITY_IMPACT_GOALS_STEP,
    COMMUNITY_REVIEW_ACTIVATE_STEP,
  ],
  COMMUNITY_STAKEHOLDER: [
    COMMUNITY_CREATE_ACCOUNT_STEP,
    COMMUNITY_ORGANIZATION_INFORMATION_STEP,
    COMMUNITY_STAKEHOLDER_TYPE_STEP,
    COMMUNITY_PROGRAM_ASSOCIATION_STEP,
    COMMUNITY_DATA_VISIBILITY_PRIVACY_STEP,
    COMMUNITY_IMPACT_GOALS_STEP,
    COMMUNITY_REVIEW_ACTIVATE_STEP,
  ],
  INVESTOR: [
    INVESTOR_CREATE_ACCOUNT_STEP,
    INVESTOR_STATUS_ACKNOWLEDGMENT_STEP,
    INVESTMENT_PREFERENCES_STEP,
    LEGAL_ACKNOWLEDGMENTS_STEP,
    INVESTOR_ALL_SET_STEP,
  ],
  ADMIN: ['profile_complete'],
};

const PROFILE_STEP_KEY = 'profile_complete';
const TEPA_STEP_KEY = 'tepa_opted_in';
const ORG_STEP_KEY = 'org_joined';

function uniqueSteps(steps: string[]): string[] {
  return Array.from(new Set(steps));
}

function getRequiredSteps(role: string): string[] {
  return REQUIRED_STEPS_BY_ROLE[role as SupportedRole] ?? [];
}

async function computeDerivedSteps(user: any): Promise<string[]> {
  const steps: string[] = [];

  if (
    user.role !== 'TENANT' &&
    user.profile?.firstName &&
    user.profile?.lastName
  ) {
    steps.push(PROFILE_STEP_KEY);
  }

  if (user.role === 'TENANT') {
    const tenancy = await TenancyModel.findOne({
      tenantUserId: user._id,
      status: 'ACTIVE',
    }).lean();

    if (tenancy) steps.push(TENANT_LEASE_ASSOCIATION_STEP);
  }

  if (['LANDLORD', 'COMMUNITY', 'COMMUNITY_STAKEHOLDER'].includes(user.role)) {
    const membership = await Membership.findOne({
      userId: user._id,
      status: 'active',
    });

    if (membership) steps.push(ORG_STEP_KEY);
  }

  // Codex: demo override is explicitly represented in completed steps for debugging.
  if (isDemoModeEnabled()) {
    steps.push('demo_override');
  }

  return uniqueSteps(steps);
}

export async function evaluateOnboarding(userRef: { _id: any; role: string }) {
  // Load the full user document so profile fields are available for derived step computation.
  const user = (await User.findById(userRef._id).lean()) ?? userRef;
  const existingState = await OnboardingState.findOne({ userId: userRef._id }).lean();
  const manualSteps = existingState?.completedSteps ?? [];
  const derivedSteps = await computeDerivedSteps(user);
  const steps = uniqueSteps([...manualSteps, ...derivedSteps]);
  const requiredSteps = getRequiredSteps(user.role);
  const complete =
    requiredSteps.every((s) => steps.includes(s)) || isDemoModeEnabled();

  const status =
    steps.length === 0 ? 'NOT_STARTED' : complete ? 'COMPLETE' : 'IN_PROGRESS';

  const nextState = await OnboardingState.findOneAndUpdate(
    { userId: user._id },
    {
      role: user.role,
      completedSteps: steps,
      status,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    role: user.role,
    completedSteps: steps,
    requiredSteps,
    status,
    isReady: status === 'COMPLETE',
    documents: (nextState?.documents ?? []).map((doc) => ({
      documentId: doc.documentId,
      stepKey: doc.stepKey,
      documentType: doc.documentType,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      status: doc.status,
      uploadedAt: doc.uploadedAt,
      reviewedByUserId: doc.reviewedByUserId ?? null,
      reviewedAt: doc.reviewedAt ?? null,
      rejectionReason: doc.rejectionReason ?? null,
    })),
  };
}

export async function submitOnboardingStep(
  user: { _id: any; role: string },
  input: SubmitStepInput
): Promise<ServiceResult<any>> {
  const { stepKey, payload = {} } = input;
  const allowedSteps = getRequiredSteps(user.role);

  if (!allowedSteps.includes(stepKey)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_STEP',
      message: `Step "${stepKey}" is not valid for role ${user.role}`,
    };
  }

  if (stepKey === TEPA_STEP_KEY) {
    return {
      ok: false,
      status: 400,
      code: 'USE_TEPA_ENDPOINT',
      message: 'Use /api/tenant/programs/tepa/opt-in to complete tepa_opted_in',
    };
  }

  if (stepKey === ORG_STEP_KEY) {
    const membership = await Membership.findOne({
      userId: user._id,
      status: 'active',
    });

    if (!membership) {
      return {
        ok: false,
        status: 400,
        code: 'ORG_MEMBERSHIP_REQUIRED',
        message: 'Active organization membership required for org_joined step',
      };
    }
  }

  if (stepKey === PROFILE_STEP_KEY) {
    const firstName =
      typeof payload.firstName === 'string' ? payload.firstName.trim() : '';
    const lastName =
      typeof payload.lastName === 'string' ? payload.lastName.trim() : '';
    const address =
      typeof payload.address === 'string' ? payload.address.trim() : undefined;

    if (!firstName || !lastName) {
      return {
        ok: false,
        status: 400,
        code: 'PROFILE_REQUIRED',
        message: 'firstName and lastName are required for profile_complete step',
      };
    }

    await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          'profile.firstName': firstName,
          'profile.lastName': lastName,
          ...(address ? { 'profile.address': address } : {}),
        },
      },
      { new: true }
    );
  }

  await OnboardingState.findOneAndUpdate(
    { userId: user._id },
    {
      role: user.role,
      $set: {
        [`stepData.${stepKey}`]: payload,
        updatedAt: new Date(),
      },
      $addToSet: { completedSteps: stepKey },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await writeAuditEvent({
    actorUserId: user._id,
    action: 'ONBOARDING_STEP_SUBMITTED',
    entityType: 'OnboardingState',
    entityId: user._id,
    diff: {
      before: null,
      after: { stepKey },
    },
  });

  const latestUser = await User.findById(user._id).lean();
  const status = await evaluateOnboarding(latestUser ?? user);

  return {
    ok: true,
    data: {
      message: 'Onboarding step submitted successfully',
      stepKey,
      status,
    },
  };
}

export async function uploadOnboardingDocument(
  user: { _id: any; role: string },
  input: UploadDocInput
): Promise<ServiceResult<any>> {
  const { stepKey, documentType, fileName, fileUrl } = input;
  const allowedSteps = getRequiredSteps(user.role);

  if (!allowedSteps.includes(stepKey)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_STEP',
      message: `Cannot upload document for step "${stepKey}" and role ${user.role}`,
    };
  }

  const onboardingState = await OnboardingState.findOneAndUpdate(
    { userId: user._id },
    {
      role: user.role,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (!onboardingState) {
    return {
      ok: false,
      status: 500,
      code: 'ONBOARDING_STATE_ERROR',
      message: 'Failed to initialize onboarding state',
    };
  }

  const documentId = randomUUID();
  const uploadedAt = new Date();
  onboardingState.documents.push({
    documentId,
    stepKey,
    documentType,
    fileName,
    fileUrl,
    status: 'PENDING',
    uploadedAt,
  });

  await onboardingState.save();

  await writeAuditEvent({
    actorUserId: user._id,
    action: 'ONBOARDING_DOC_UPLOADED',
    entityType: 'OnboardingState',
    entityId: onboardingState.userId,
    diff: {
      before: null,
      after: { documentId, stepKey, documentType },
    },
  });

  return {
    ok: true,
    data: {
      message: 'Onboarding document uploaded successfully',
      document: {
        documentId,
        stepKey,
        documentType,
        fileName: fileName ?? null,
        fileUrl,
        status: 'PENDING',
        uploadedAt: uploadedAt.toISOString(),
        reviewedByUserId: null,
        reviewedAt: null,
        rejectionReason: null,
      },
    },
  };
}

export async function verifyOnboardingDocument(
  actor: { _id: any; role: string },
  input: VerifyDocInput
): Promise<ServiceResult<any>> {
  if (actor.role !== 'ADMIN' && actor.role !== 'admin') {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Admin only endpoint',
    };
  }

  if (!Types.ObjectId.isValid(input.userId)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_USER_ID',
      message: 'userId must be a valid ObjectId',
    };
  }

  const onboardingState = await OnboardingState.findOne({
    userId: new Types.ObjectId(input.userId),
  });

  if (!onboardingState) {
    return {
      ok: false,
      status: 404,
      code: 'ONBOARDING_NOT_FOUND',
      message: 'Onboarding state not found for user',
    };
  }

  const targetDocument = onboardingState.documents.find(
    (document) => document.documentId === input.documentId
  );

  if (!targetDocument) {
    return {
      ok: false,
      status: 404,
      code: 'DOCUMENT_NOT_FOUND',
      message: 'Onboarding document not found',
    };
  }

  targetDocument.status = input.decision;
  targetDocument.reviewedByUserId = actor._id;
  targetDocument.reviewedAt = new Date();
  targetDocument.rejectionReason =
    input.decision === 'REJECTED' ? input.rejectionReason : undefined;

  onboardingState.updatedAt = new Date();
  await onboardingState.save();

  await writeAuditEvent({
    actorUserId: actor._id,
    action: 'ONBOARDING_DOC_VERIFIED',
    entityType: 'OnboardingState',
    entityId: onboardingState.userId,
    diff: {
      before: null,
      after: {
        documentId: input.documentId,
        decision: input.decision,
      },
    },
  });

  return {
    ok: true,
    data: {
      message: 'Onboarding document verification updated',
      document: {
        documentId: targetDocument.documentId,
        status: targetDocument.status,
        reviewedByUserId: targetDocument.reviewedByUserId,
        reviewedAt: targetDocument.reviewedAt,
        rejectionReason: targetDocument.rejectionReason ?? null,
      },
    },
  };
}

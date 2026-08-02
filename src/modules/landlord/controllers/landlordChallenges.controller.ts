import { Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import { resolveLandlordOrgId } from '../services/landlordDashboard.service';
import { writeAuditEvent } from '../../audit/services/audit.service';
import {
  createChallenge,
  updateChallenge,
  deactivateChallenge,
  listChallengesForOrg,
  listParticipationsForChallenge,
  reviewParticipation,
} from '../../tenant/services/challenges.service';

const CreateChallengeSchema = z.object({
  challengeId: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Must be lowercase kebab-case'),
  title: z.string().min(1),
  description: z.string().min(1),
  rewardPoints: z.number().int().min(0),
  detail: z.string().optional(),
  actionLabel: z.string().min(1),
  verificationMode: z.enum(['AUTOMATIC', 'MANUAL']).default('MANUAL'),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  location: z.string().optional().nullable(),
  maxParticipants: z.number().int().min(1).optional().nullable(),
});

const PatchChallengeSchema = CreateChallengeSchema.omit({ challengeId: true }).partial();

const ReviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().optional(),
});

export async function listLandlordChallengesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    const orgId = await resolveLandlordOrgId(userId);
    const challenges = await listChallengesForOrg(orgId);
    successResponse(res, { challenges });
  } catch (e: any) {
    if (e instanceof AppError) { errorResponse(res, e.statusCode, 'ERROR', e.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list challenges');
  }
}

export async function createLandlordChallengeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    const orgId = await resolveLandlordOrgId(userId);
    const body = CreateChallengeSchema.parse(req.body);

    const challenge = await createChallenge({
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      creatorType: 'LANDLORD',
      createdBy: userId,
      orgId: new mongoose.Types.ObjectId(orgId),
    });
    await writeAuditEvent({
      actorUserId: userId,
      orgId: new mongoose.Types.ObjectId(orgId),
      action: 'CHALLENGE_CREATED',
      entityType: 'CHALLENGE',
      entityId: (challenge as any)._id,
      diff: { after: { challengeId: challenge.challengeId, title: challenge.title } },
    });
    successResponse(res, { challenge }, 201);
  } catch (e: any) {
    if (e instanceof AppError) { errorResponse(res, e.statusCode, 'ERROR', e.message); return; }
    if (e.name === 'ZodError') { errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', e.errors); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to create challenge');
  }
}

export async function patchLandlordChallengeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    const orgId = await resolveLandlordOrgId(userId);
    const { id } = req.params;
    const body = PatchChallengeSchema.parse(req.body);

    const patch: any = { ...body };
    if (body.startDate) patch.startDate = new Date(body.startDate);
    if (body.endDate) patch.endDate = new Date(body.endDate);

    const challenge = await updateChallenge(id, orgId, patch);
    successResponse(res, { challenge });
  } catch (e: any) {
    if (e instanceof AppError) { errorResponse(res, e.statusCode, 'ERROR', e.message); return; }
    if (e.name === 'ZodError') { errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', e.errors); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to update challenge');
  }
}

export async function deleteLandlordChallengeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    const orgId = await resolveLandlordOrgId(userId);
    await deactivateChallenge(req.params.id, orgId);
    await writeAuditEvent({
      actorUserId: userId,
      orgId: new mongoose.Types.ObjectId(orgId),
      action: 'CHALLENGE_DEACTIVATED',
      entityType: 'CHALLENGE',
      metadata: { challengeDocId: req.params.id },
    });
    successResponse(res, { message: 'Challenge deactivated' });
  } catch (e: any) {
    if (e instanceof AppError) { errorResponse(res, e.statusCode, 'ERROR', e.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to deactivate challenge');
  }
}

export async function listChallengeParticipationsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    const orgId = await resolveLandlordOrgId(userId);
    const participations = await listParticipationsForChallenge(req.params.id, orgId);
    successResponse(res, { participations });
  } catch (e: any) {
    if (e instanceof AppError) { errorResponse(res, e.statusCode, 'ERROR', e.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list participations');
  }
}

export async function reviewParticipationHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    const body = ReviewSchema.parse(req.body);
    const orgId = await resolveLandlordOrgId(userId);
    const result = await reviewParticipation(
      req.params.participationId,
      userId,
      body.action,
      body.rejectionReason
    );
    await writeAuditEvent({
      actorUserId: userId,
      orgId: new mongoose.Types.ObjectId(orgId),
      action: 'CHALLENGE_PARTICIPATION_REVIEWED',
      entityType: 'CHALLENGE_PARTICIPATION',
      metadata: { participationId: req.params.participationId, action: body.action, rejectionReason: body.rejectionReason },
    });
    successResponse(res, result);
  } catch (e: any) {
    if (e instanceof AppError) { errorResponse(res, e.statusCode, 'ERROR', e.message); return; }
    if (e.name === 'ZodError') { errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', e.errors); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to review participation');
  }
}

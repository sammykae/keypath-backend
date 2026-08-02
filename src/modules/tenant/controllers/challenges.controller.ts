import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { AppError } from '../../../core/errors/AppError';
import {
  getActiveChallengesForTenant,
  claimChallenge,
  submitChallengeProof,
  getChallengeHistory,
} from '../services/challenges.service';

export async function getChallengesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const tenantUserId = req.auth?._id as mongoose.Types.ObjectId;
    if (!tenantUserId) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const challenges = await getActiveChallengesForTenant(tenantUserId);
    successResponse(res, { challenges });
  } catch (e) {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch challenges');
  }
}

export async function claimChallengeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const tenantUserId = req.auth?._id as mongoose.Types.ObjectId;
    if (!tenantUserId) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const result = await claimChallenge(tenantUserId, req.params.challengeId);
    successResponse(res, result, 201);
  } catch (e: any) {
    if (e instanceof AppError) { errorResponse(res, e.statusCode, 'ERROR', e.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to claim challenge');
  }
}

export async function submitChallengeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const tenantUserId = req.auth?._id as mongoose.Types.ObjectId;
    if (!tenantUserId) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const { proofUrl } = req.body;
    const result = await submitChallengeProof(tenantUserId, req.params.challengeId, proofUrl);
    successResponse(res, result);
  } catch (e: any) {
    if (e instanceof AppError) { errorResponse(res, e.statusCode, 'ERROR', e.message); return; }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to submit challenge proof');
  }
}

export async function getChallengeHistoryHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const tenantUserId = req.auth?._id as mongoose.Types.ObjectId;
    if (!tenantUserId) { errorResponse(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
    const history = await getChallengeHistory(tenantUserId);
    successResponse(res, { history });
  } catch (e) {
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch challenge history');
  }
}

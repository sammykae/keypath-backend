import { Request, Response } from 'express';
import { z } from 'zod';
import { errorResponse, successResponse } from '../../../core/utils/response';
import { createDemoRequestBodySchema } from '../dto/demo-request.dto';
import { createDemoRequest } from '../services/demo-request.service';
import { DemoRequestModel } from '../models/demo-request.model';

export const listDemoRequestsHandler = async (req: Request, res: Response) => {
  try {
    const { search, interest, reviewStatus, page = '1', limit = '50' } = req.query as Record<string, string>;

    const filter: Record<string, any> = {};

    if (reviewStatus && reviewStatus !== 'all') {
      filter.reviewStatus = reviewStatus.toUpperCase();
    }
    if (interest && interest !== 'all') {
      const map: Record<string, string> = {
        landlord: 'LANDLORD_PROPERTY_OWNER',
        tenant: 'TENANT',
        investor: 'INVESTOR',
        community: 'COMMUNITY_STAKEHOLDER',
        other: 'OTHER',
      };
      filter.interestedAs = map[interest.toLowerCase()] ?? interest.toUpperCase();
    }
    if (search) {
      const re = new RegExp(search.trim(), 'i');
      filter.$or = [
        { firstName: re }, { lastName: re },
        { email: re }, { companyOrOrganization: re },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      DemoRequestModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      DemoRequestModel.countDocuments(filter),
    ]);

    const interestLabel = (v: string) => {
      const m: Record<string, string> = {
        LANDLORD_PROPERTY_OWNER: 'landlord',
        TENANT: 'tenant',
        INVESTOR: 'investor',
        COMMUNITY_STAKEHOLDER: 'community',
        OTHER: 'other',
      };
      return m[v] ?? 'other';
    };

    const data = items.map((r) => ({
      id: String(r._id),
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phoneNumber,
      title: r.titleOrRole,
      company: r.companyOrOrganization,
      interest: interestLabel(r.interestedAs),
      notes: r.inquiryNotes ?? '',
      submittedAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
      status: (r.reviewStatus ?? 'PENDING').toLowerCase() as 'pending' | 'scheduled' | 'archived',
    }));

    return successResponse(res, { items: data, total, page: pageNum, limit: limitNum });
  } catch {
    return errorResponse(res, 500, 'LIST_DEMO_REQUESTS_FAILED', 'Failed to fetch demo requests');
  }
};

export const updateDemoRequestStatusHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reviewStatus } = req.body;

    const allowed = ['PENDING', 'SCHEDULED', 'ARCHIVED'];
    const normalized = String(reviewStatus ?? '').toUpperCase();
    if (!allowed.includes(normalized)) {
      return errorResponse(res, 400, 'INVALID_STATUS', `reviewStatus must be one of: ${allowed.join(', ')}`);
    }

    const updated = await DemoRequestModel.findByIdAndUpdate(
      id,
      { reviewStatus: normalized },
      { new: true }
    ).lean();

    if (!updated) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Demo request not found');
    }

    return successResponse(res, { id: String(updated._id), reviewStatus: updated.reviewStatus });
  } catch {
    return errorResponse(res, 500, 'UPDATE_STATUS_FAILED', 'Failed to update demo request status');
  }
};

export const createDemoRequestHandler = async (req: Request, res: Response) => {
  try {
    const payload = createDemoRequestBodySchema.parse(req.body);
    const result = await createDemoRequest(payload);

    const successMessage =
      result.notification.status === 'SENT'
        ? 'Demo request submitted successfully'
        : 'Demo request saved, but email notification failed';

    return successResponse(
      res,
      {
        message: successMessage,
        demoRequestId: result.demoRequestId,
        notification: result.notification,
      },
      201
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        res,
        400,
        'VALIDATION_ERROR',
        'Invalid request data',
        err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }))
      );
    }

    return errorResponse(
      res,
      500,
      'DEMO_REQUEST_CREATE_FAILED',
      'Failed to submit demo request'
    );
  }
};

import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../../auth/types/auth-request';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { PropertyModel } from '../models/propertyModel';
import { LoanModel } from '../../loans/models/loanModel';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';
import { AppError } from '../../../core/errors/AppError';
import { CreateLoanSchema, UpdateLoanSchema } from '../../loans/dto/loanDTO';
import { writeAuditEvent } from '../../audit/services/audit.service';

/**
 * @swagger
 * /api/properties/{id}/loans:
 *   get:
 *     summary: Get all loans for a property
 *     description: Returns all loan records attached to a property. Supports multiple loans per property. Scoped to the authenticated landlord's org.
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     responses:
 *       200:
 *         description: List of loans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     loans:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           lender:
 *                             type: string
 *                           type:
 *                             type: string
 *                             enum: [PERM, CONST, MEZZ, PREF]
 *                           rateType:
 *                             type: string
 *                             enum: [FIXED, FLOATING, BALLOON]
 *                           rate:
 *                             type: number
 *                           origBalance:
 *                             type: number
 *                           currentBalance:
 *                             type: number
 *                           originationDate:
 *                             type: string
 *                           maturityDate:
 *                             type: string
 *                           interestOnlyMonths:
 *                             type: number
 *                           prepayPenalty:
 *                             type: object
 *                           extensionOptions:
 *                             type: array
 *       400:
 *         description: Invalid property ID
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden – landlord or admin role required
 *       404:
 *         description: Property not found
 *       500:
 *         description: Server error
 */
async function verifyOwnership(userId: mongoose.Types.ObjectId, propertyId: string) {
  const orgId = await resolveLandlordOrgId(userId);
  const property = await PropertyModel.findOne({
    _id: new mongoose.Types.ObjectId(propertyId),
    orgId: new mongoose.Types.ObjectId(orgId),
  }).lean();
  if (!property) throw new AppError('Property not found', 404);
  return orgId;
}

function formatLoan(l: any) {
  return {
    id: l._id.toString(),
    propertyId: l.propertyId.toString(),
    lender: l.lender,
    type: l.type,
    rateType: l.rateType,
    rate: l.rate,
    origBalance: l.origBalance,
    currentBalance: l.currentBalance,
    originationDate: l.originationDate?.toISOString() ?? null,
    maturityDate: l.maturityDate?.toISOString() ?? null,
    interestOnlyMonths: l.interestOnlyMonths,
    prepayPenalty: l.prepayPenalty ?? null,
    extensionOptions: l.extensionOptions ?? [],
  };
}

export async function getPropertyLoansHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) { errorResponse(res, 400, 'INVALID_ID', 'Invalid property ID'); return; }
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    await verifyOwnership(userId, id);
    const loans = await LoanModel.find({ propertyId: new mongoose.Types.ObjectId(id) }).sort({ maturityDate: 1 }).lean();
    successResponse(res, { loans: loans.map(formatLoan) });
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'ERROR', err.message); return; }
    console.error('[PROPERTY_LOANS_ERROR]', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch loans');
  }
}

/**
 * @swagger
 * /api/properties/{id}/loans:
 *   post:
 *     summary: Add a loan to a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lender, type, rateType, rate, origBalance, currentBalance, originationDate, maturityDate]
 *             properties:
 *               lender:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [PERM, CONST, MEZZ, PREF]
 *               rateType:
 *                 type: string
 *                 enum: [FIXED, FLOATING, BALLOON]
 *               rate:
 *                 type: number
 *               origBalance:
 *                 type: number
 *               currentBalance:
 *                 type: number
 *               originationDate:
 *                 type: string
 *               maturityDate:
 *                 type: string
 *               interestOnlyMonths:
 *                 type: number
 *               prepayPenalty:
 *                 type: string
 *     responses:
 *       201:
 *         description: Loan created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Property not found
 */
export async function createPropertyLoanHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) { errorResponse(res, 400, 'INVALID_ID', 'Invalid property ID'); return; }
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    await verifyOwnership(userId, id);

    const parsed = CreateLoanSchema.safeParse({ ...req.body, propertyId: id });
    if (!parsed.success) { errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues); return; }

    const loan = await LoanModel.create({ ...parsed.data, propertyId: new mongoose.Types.ObjectId(id) });

    await writeAuditEvent({
      actorUserId: userId,
      action: 'LOAN_CREATED',
      entityType: 'loan',
      entityId: loan._id as mongoose.Types.ObjectId,
      metadata: { propertyId: id, lender: parsed.data.lender, type: parsed.data.type },
    });

    successResponse(res, { loan: formatLoan(loan.toObject()) }, 201);
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'ERROR', err.message); return; }
    if (err?.name === 'ZodError') { errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', err.issues); return; }
    console.error('[PROPERTY_LOAN_CREATE_ERROR]', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to create loan');
  }
}

/**
 * @swagger
 * /api/properties/{id}/loans/{loanId}:
 *   delete:
 *     summary: Delete a loan from a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: loanId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Loan deleted
 *       404:
 *         description: Loan or property not found
 */
export async function deletePropertyLoanHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id, loanId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(loanId)) {
      errorResponse(res, 400, 'INVALID_ID', 'Invalid ID'); return;
    }
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    await verifyOwnership(userId, id);

    const deleted = await LoanModel.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(loanId),
      propertyId: new mongoose.Types.ObjectId(id),
    });
    if (!deleted) { errorResponse(res, 404, 'NOT_FOUND', 'Loan not found'); return; }

    await writeAuditEvent({
      actorUserId: userId,
      action: 'LOAN_DELETED',
      entityType: 'loan',
      entityId: new mongoose.Types.ObjectId(loanId),
      metadata: { propertyId: id },
    });

    successResponse(res, { deleted: true });
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'ERROR', err.message); return; }
    console.error('[PROPERTY_LOAN_DELETE_ERROR]', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to delete loan');
  }
}

/**
 * @swagger
 * /api/properties/{id}/loans/{loanId}:
 *   patch:
 *     summary: Update a loan on a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: loanId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lender:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [PERM, CONST, MEZZ, PREF]
 *               rateType:
 *                 type: string
 *                 enum: [FIXED, FLOATING, BALLOON]
 *               rate:
 *                 type: number
 *               origBalance:
 *                 type: number
 *               currentBalance:
 *                 type: number
 *               originationDate:
 *                 type: string
 *               maturityDate:
 *                 type: string
 *               interestOnlyMonths:
 *                 type: number
 *               prepayPenalty:
 *                 type: string
 *     responses:
 *       200:
 *         description: Loan updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Loan or property not found
 */
export async function updatePropertyLoanHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id, loanId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(loanId)) {
      errorResponse(res, 400, 'INVALID_ID', 'Invalid ID'); return;
    }
    const userId = req.auth?._id as mongoose.Types.ObjectId;
    await verifyOwnership(userId, id);

    const parsed = UpdateLoanSchema.safeParse(req.body);
    if (!parsed.success) { errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues); return; }

    const updated = await LoanModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(loanId), propertyId: new mongoose.Types.ObjectId(id) },
      { $set: parsed.data },
      { new: true }
    ).lean();
    if (!updated) { errorResponse(res, 404, 'NOT_FOUND', 'Loan not found'); return; }

    await writeAuditEvent({
      actorUserId: userId,
      action: 'LOAN_UPDATED',
      entityType: 'loan',
      entityId: new mongoose.Types.ObjectId(loanId),
      metadata: { propertyId: id, changes: Object.keys(parsed.data) },
    });

    successResponse(res, { loan: formatLoan(updated) });
  } catch (err: any) {
    if (err instanceof AppError) { errorResponse(res, err.statusCode, 'ERROR', err.message); return; }
    console.error('[PROPERTY_LOAN_UPDATE_ERROR]', err);
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to update loan');
  }
}

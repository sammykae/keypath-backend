import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import {
  listPaymentsHandler,
  createPaymentHandler,
  updatePaymentHandler,
  deletePaymentHandler,
} from '../controllers/landlordPayments.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['landlord', 'admin']));

/**
 * @swagger
 * /api/landlord/payments:
 *   get:
 *     summary: List payments (landlord/admin)
 *     description: Org-scoped. Returns payments for landlord org. Optional filters - range, propertyId, unitId, tenantUserId, status.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           default: 12m
 *         description: Time range e.g. 12m, 6m, 1m
 *       - in: query
 *         name: propertyId
 *         schema:
 *           type: string
 *         description: Filter by property ObjectId
 *       - in: query
 *         name: unitId
 *         schema:
 *           type: string
 *         description: Filter by unit ObjectId
 *       - in: query
 *         name: tenantUserId
 *         schema:
 *           type: string
 *         description: Filter by tenant user ObjectId
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DUE, PAID, LATE, FAILED]
 *         description: Filter by payment status
 *     responses:
 *       200:
 *         description: Array of payments with id, tenantUserId, unitId, propertyId, period, amount, status, dueDate, paidAt, method, metadata, createdAt, updatedAt
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No landlord org found
 */
router.get('/payments', listPaymentsHandler);

/**
 * @swagger
 * /api/landlord/payments:
 *   post:
 *     summary: Create payment (BE-501)
 *     description: Org-scoped. Creates a payment for a tenant in a unit/property.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantUserId, unitId, propertyId, period, amount]
 *             properties:
 *               tenantUserId:
 *                 type: string
 *                 description: Tenant user ObjectId
 *               unitId:
 *                 type: string
 *                 description: Unit ObjectId
 *               propertyId:
 *                 type: string
 *                 description: Property ObjectId
 *               period:
 *                 type: string
 *                 pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$'
 *                 example: "2025-03"
 *                 description: YYYY-MM
 *               amount:
 *                 type: number
 *                 minimum: 0
 *               status:
 *                 type: string
 *                 enum: [DUE, PAID, LATE, FAILED]
 *                 default: DUE
 *               dueDate:
 *                 type: string
 *                 format: date
 *               paidAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               method:
 *                 type: string
 *                 nullable: true
 *               metadata:
 *                 type: object
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Full payment object (id, tenantUserId, unitId, propertyId, period, amount, status, dueDate, paidAt?, method?, metadata?, createdAt, updatedAt)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Property not in org
 *       409:
 *         description: Payment already exists for period
 */
router.post('/payments', createPaymentHandler);

/**
 * @swagger
 * /api/landlord/payments/{paymentId}:
 *   patch:
 *     summary: Update payment (BE-501)
 *     description: Org-scoped. Updates amount, status, paidAt, method, metadata. Validates status transitions.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 0
 *               status:
 *                 type: string
 *                 enum: [DUE, PAID, LATE, FAILED]
 *               paidAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               method:
 *                 type: string
 *                 nullable: true
 *               metadata:
 *                 type: object
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Full payment object (id, tenantUserId, unitId, propertyId, period, amount, status, dueDate, paidAt?, method?, metadata?, createdAt, updatedAt)
 *       400:
 *         description: Validation error or invalid status transition
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Payment not in org
 *       404:
 *         description: Payment not found
 */
router.patch('/payments/:paymentId', updatePaymentHandler);

/**
 * @swagger
 * /api/landlord/payments/{paymentId}:
 *   delete:
 *     summary: Delete payment (BE-501)
 *     description: Org-scoped. Deletes a payment if it belongs to landlord org.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Payment not in org
 *       404:
 *         description: Payment not found
 */
router.delete('/payments/:paymentId', deletePaymentHandler);

export default router;

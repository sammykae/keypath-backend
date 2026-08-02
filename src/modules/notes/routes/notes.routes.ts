import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import {
  createNoteHandler,
  listNotesHandler,
  updateNoteHandler,
  deleteNoteHandler,
} from '../controllers/notes.controller';

const router = Router();

router.use(authMiddleware);
// Property Manager role will be added here once it exists
router.use(requireRole(['landlord', 'admin']));

/**
 * @swagger
 * /api/landlord/notes:
 *   post:
 *     summary: Create a property-management note
 *     description: Notes exist at property level and optionally at unit/tenant level. Writes an audit event. Org-scoped.
 *     tags: [Landlord, Notes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, noteType, noteText]
 *             properties:
 *               propertyId: { type: string }
 *               unitId: { type: string }
 *               tenantId: { type: string }
 *               noteType:
 *                 type: string
 *                 enum: [PROPERTY, TENANT, MAINTENANCE, RENEWAL, PAYMENT, COMPLIANCE]
 *               noteText: { type: string, maxLength: 5000 }
 *               attachments:
 *                 type: array
 *                 maxItems: 10
 *                 items:
 *                   type: object
 *                   properties:
 *                     fileKey: { type: string }
 *                     fileName: { type: string }
 *                     fileType: { type: string }
 *               visibility:
 *                 type: string
 *                 enum: [LANDLORD_ONLY, LANDLORD_AND_PM]
 *                 default: LANDLORD_AND_PM
 *     responses:
 *       201:
 *         description: Note created
 *       400:
 *         description: Validation error
 *       403:
 *         description: Property not in landlord org
 *   get:
 *     summary: List property-management notes
 *     description: Filter by propertyId, tenantId, noteType. Cursor-paginated, newest first. Org-scoped.
 *     tags: [Landlord, Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema: { type: string }
 *       - in: query
 *         name: tenantId
 *         schema: { type: string }
 *       - in: query
 *         name: noteType
 *         schema:
 *           type: string
 *           enum: [PROPERTY, TENANT, MAINTENANCE, RENEWAL, PAYMENT, COMPLIANCE]
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25, maximum: 100 }
 *     responses:
 *       200:
 *         description: notes[], nextCursor
 */
router.post('/', createNoteHandler);
router.get('/', listNotesHandler);

/**
 * @swagger
 * /api/landlord/notes/{noteId}:
 *   patch:
 *     summary: Update a note (text, type, visibility)
 *     tags: [Landlord, Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               noteType:
 *                 type: string
 *                 enum: [PROPERTY, TENANT, MAINTENANCE, RENEWAL, PAYMENT, COMPLIANCE]
 *               noteText: { type: string, maxLength: 5000 }
 *               visibility:
 *                 type: string
 *                 enum: [LANDLORD_ONLY, LANDLORD_AND_PM]
 *     responses:
 *       200:
 *         description: Updated note
 *       404:
 *         description: Note not found
 *   delete:
 *     summary: Delete a note
 *     tags: [Landlord, Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Note not found
 */
router.patch('/:noteId', updateNoteHandler);
router.delete('/:noteId', deleteNoteHandler);

export default router;

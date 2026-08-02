import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { normalizeRoleForRbac } from '../../tenant/middleware/normalizeRoleForRbac';
import { councilBriefHandler } from '../controllers/councilBrief.controller';
import { reportEngineHandler } from '../controllers/reportEngine.controller';
import { portfolioReportHandler } from '../controllers/portfolioReport.controller';
import { dataExportHandler } from '../controllers/dataExport.controller';

const router = Router();

/**
 * @swagger
 * /api/reports/council-brief:
 *   get:
 *     summary: Generate City Council Brief (one-page PDF)
 *     description: Returns a presentation-ready one-page PDF with latest program metrics, charts, and key takeaways.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
/**
 * @swagger
 * /api/reports/portfolio:
 *   post:
 *     summary: Generate Portfolio Report (PDF)
 *     description: Returns a PDF summary of the landlord's portfolio including property counts, unit occupancy, active tenancies, and a full property list. Scoped to the authenticated landlord's org.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden – landlord or admin role required
 *       500:
 *         description: Server error
 */
router.post('/portfolio', authMiddleware, normalizeRoleForRbac, requireRole(['landlord', 'admin']), portfolioReportHandler);
router.get('/council-brief', authMiddleware, councilBriefHandler);

/**
 * @swagger
 * /api/reports/{reportType}:
 *   get:
 *     summary: Generate report (PDF or CSV)
 *     description: Report types - quarterly-economic-impact, annual-housing-stability, tenant-participation-summary, local-vendor-spend, fiscal-impact-summary. Use query format=pdf or format=csv (default csv). For quarterly-economic-impact, optional year and quarter (1-4).
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [quarterly-economic-impact, annual-housing-stability, tenant-participation-summary, local-vendor-spend, fiscal-impact-summary]
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [pdf, csv]
 *           default: csv
 *       - in: query
 *         name: year
 *         description: For quarterly-economic-impact only (e.g. 2026)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: quarter
 *         description: For quarterly-economic-impact only (1-4)
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Report file (CSV or PDF)
 *       400:
 *         description: Invalid report type or format
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/:reportType', authMiddleware, reportEngineHandler);

export default router;

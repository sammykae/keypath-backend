import { Router } from 'express';

import { successResponse } from '../../../core/utils/response';

const router = Router();  

// Codex: health endpoint docs aligned to shared envelope/schema components.
// ─────────────────────────────────────────────────────────────────────────────
// Public health check – no auth, no rate-limit needed
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Server health check
 *     description: Returns server status, version, uptime, timestamp and environment. Public endpoint - no authentication required.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/health', (req, res) => {
  successResponse(res, {  
    status: 'ok',
    version: process.env.npm_package_version || '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),  
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});



export default router;

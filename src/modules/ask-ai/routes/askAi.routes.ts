import { Router } from 'express';
import {
  askAiController,
  askAiStreamController,
  healthCheckController,
  retrieveDocsController,
} from '../controllers/askAi.controller';
import {
  getAskAiFeatureFlagHandler,
  updateAskAiFeatureFlagHandler,
} from '../controllers/askAiFeatureFlag.controller';
import {
  listKnowledgeDocsHandler,
  createKnowledgeDocHandler,
  searchKnowledgeHandler,
} from '../controllers/askAiKnowledge.controller';
import { optionalAuthMiddleware } from '../middleware/optionalAuth.middleware';
import { askAiFeatureFlagMiddleware } from '../middleware/featureFlag.middleware';
import { askAiRateLimitMiddleware } from '../middleware/rateLimit.middleware';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     AskAiRequest:
 *       type: object
 *       required:
 *         - question
 *         - mode
 *       properties:
 *         question:
 *           type: string
 *           minLength: 1
 *           maxLength: 2000
 *           description: The question to ask the AI
 *           example: "How do I earn tokens as a tenant?"
 *         mode:
 *           type: string
 *           enum: [tenant_dashboard, landlord_dashboard, community_dashboard, investor_dashboard, general]
 *           description: Dashboard mode for role-scoped responses
 *           example: "tenant_dashboard"
 *         context:
 *           type: object
 *           description: Optional context for scoping the query
 *           properties:
 *             unitId:
 *               type: string
 *               description: Optional unit ID for unit-specific queries
 *             propertyId:
 *               type: string
 *               description: Optional property ID for property-specific queries
 *             orgId:
 *               type: string
 *               description: Optional organization ID
 *     AskAiResponse:
 *       type: object
 *       properties:
 *         answer:
 *           type: string
 *           description: The AI-generated answer from Gemini
 *           example: "KeyPath is an AI-powered fintech platform that turns renting into a pathway to ownership through tokenized equity and tenant rewards..."
 *         citations:
 *           type: array
 *           description: Source citations from RAG retrieval (may be empty if no relevant sources found)
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               source:
 *                 type: string
 *               content:
 *                 type: string
 *               relevanceScore:
 *                 type: number
 *         safety:
 *           type: object
 *           properties:
 *             blocked:
 *               type: boolean
 *               example: false
 *             reason:
 *               type: string
 *         meta:
 *           type: object
 *           properties:
 *             requestId:
 *               type: string
 *               format: uuid
 *             model:
 *               type: string
 *               example: "gemini-2.5-flash"
 *             latencyMs:
 *               type: number
 *               example: 5
 */

/**
 * @swagger
 * /api/ask-ai:
 *   post:
 *     summary: Ask AI a question (Gemini-powered)
 *     description: |
 *       Submit a question to the KeyPath AI assistant powered by Google Gemini.
 *       Uses RAG (Retrieval-Augmented Generation) to provide accurate, citation-backed responses.
 *
 *       **Authentication**: Optional (Bearer JWT)
 *       - **Authenticated users**: Full access including role-specific modes (tenant_dashboard, landlord_dashboard, etc.)
 *       - **Unauthenticated users**: Use "general" mode for KeyPath and general real estate questions; role-specific modes return 401
 *
 *       **RBAC**: Role from JWT when present
 *       **Audit**: ASK_AI_REQUESTED/ASK_AI_COMPLETED for authenticated users only
 *       **Safety**: All queries are checked for safety and inappropriate content
 *     tags: [Ask AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *           example: Bearer <jwt>
 *         description: Optional JWT for role-specific access; omit for general mode only
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AskAiRequest'
 *           examples:
 *             unauthenticated:
 *               summary: Unauthenticated user asking general question
 *               value:
 *                 question: "What is KeyPath and how does tokenization work?"
 *                 mode: "general"
 *             tenant:
 *               summary: "Tenant asking about tokens (requires x-user-role header: tenant)"
 *               value:
 *                 question: "How do I earn tokens as a tenant?"
 *                 mode: "tenant_dashboard"
 *             landlord:
 *               summary: "Landlord asking about property (requires x-user-role header: landlord)"
 *               value:
 *                 question: "What is the occupancy rate for my properties?"
 *                 mode: "landlord_dashboard"
 *                 context:
 *                   propertyId: "prop_123"
 *     responses:
 *       200:
 *         description: Successful AI response from Gemini
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AskAiResponse'
 *             example:
 *               answer: "KeyPath is an AI-powered fintech platform that turns renting into a pathway to ownership through tokenized equity..."
 *               citations:
 *                 - id: "uuid-here"
 *                   source: "KeyPath Knowledge Base"
 *                   content: "KeyPath platform overview..."
 *                   relevanceScore: 0.95
 *               safety:
 *                 blocked: false
 *               meta:
 *                 requestId: "uuid-here"
 *                 model: "gemini-2.5-flash"
 *                 latencyMs: 1250
 *       400:
 *         description: Invalid request - validation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                       message:
 *                         type: string
 *       401:
 *         description: Authentication required for role-specific questions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required for role-specific questions. Please use \"general\" mode for unauthenticated access."
 *             examples:
 *               unauthenticatedRoleSpecific:
 *                 summary: Unauthenticated user trying role-specific mode
 *                 value:
 *                   error: "Authentication required for role-specific questions. Please use \"general\" mode for unauthenticated access."
 *                   answer: ""
 *                   citations: []
 *                   safety:
 *                     blocked: true
 *                     reason: "Authentication required for role-specific questions. Please use \"general\" mode for unauthenticated access."
 *                   meta:
 *                     requestId: "uuid-here"
 *                     model: "gemini-2.5-flash"
 *                     latencyMs: 5
 *       429:
 *         description: Rate limit exceeded (Gemini API rate limit or application rate limit)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Rate limit exceeded. Please try again later."
 *       503:
 *         description: Ask AI feature is disabled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Ask AI feature is currently disabled"
 */
router.post(
  '/',
  askAiFeatureFlagMiddleware,
  optionalAuthMiddleware,
  askAiRateLimitMiddleware,
  askAiController
);

router.post(
  '/stream',
  askAiFeatureFlagMiddleware,
  optionalAuthMiddleware,
  askAiRateLimitMiddleware,
  askAiStreamController
);

/**
 * @swagger
 * components:
 *   schemas:
 *     RetrieveDocsRequest:
 *       type: object
 *       required: [question, role]
 *       properties:
 *         question:
 *           type: string
 *           minLength: 1
 *           maxLength: 2000
 *           description: The question to find relevant docs for
 *           example: "How do tenant tokens work?"
 *         role:
 *           type: string
 *           enum: [tenant, landlord, community, investor, admin]
 *           description: Audience role for filtering docs (only docs for this role or ALL are returned)
 *           example: "tenant"
 *         topK:
 *           type: integer
 *           minimum: 1
 *           maximum: 8
 *           default: 5
 *           description: Max number of docs to return (bounded by 8)
 *     RetrievedDoc:
 *       type: object
 *       properties:
 *         docId: { type: string, description: Document ID }
 *         title: { type: string }
 *         snippet: { type: string, description: Truncated content (~300 chars) }
 *         sourceType: { type: string, enum: [FAQ, TEPA_SUMMARY, PRODUCT_DOC, POLICY] }
 *         score: { type: number, description: Relevance score from vector search }
 */

/**
 * @swagger
 * /api/ask-ai/retrieve:
 *   post:
 *     summary: RAG retrieval – get relevant docs (AI-005)
 *     description: |
 *       Given a question, returns top-k relevant knowledge docs from the ask-ai vector index.
 *       Uses query embedding, Atlas vector search, and role-based filtering. Snippets are truncated to ~300 chars.
 *       No auth required; role is passed in the body. topK is bounded (max 8).
 *     tags: [Ask AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RetrieveDocsRequest'
 *           example:
 *             question: "How do I earn tokens as a tenant?"
 *             role: "tenant"
 *             topK: 5
 *     responses:
 *       200:
 *         description: List of relevant docs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 requestId: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     docs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/RetrievedDoc'
 *             example:
 *               success: true
 *               data:
 *                 docs:
 *                   - docId: "507f1f77bcf86cd799439011"
 *                     title: "Tenant token earnings"
 *                     snippet: "Tenants earn tokens through on-time rent payments..."
 *                     sourceType: "FAQ"
 *                     score: 0.87
 *       400:
 *         description: Validation error (invalid question, role, or topK)
 *       503:
 *         description: Ask AI feature is disabled
 */
router.post(
  '/retrieve',
  askAiFeatureFlagMiddleware,
  askAiRateLimitMiddleware,
  retrieveDocsController
);

/**
 * @swagger
 * /api/ask-ai/stream:
 *   post:
 *     summary: Stream AI response (Gemini-powered, SSE)
 *     description: |
 *       Streams the AI response using Server-Sent Events (SSE).
 *       Authentication optional; role-based access enforced.
 *     tags: [Ask AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AskAiRequest'
 *     responses:
 *       200:
 *         description: Streaming AI response
 *       401:
 *         description: Authentication required for role-specific questions
 *       400:
 *         description: Invalid request
 */

/**
 * @swagger
 * /api/ask-ai/knowledge/docs:
 *   get:
 *     tags: [Ask AI]
 *     summary: List knowledge docs
 *     description: List docs with optional filters. Requires Bearer JWT. Embedding field is omitted.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sourceType
 *         schema:
 *           type: string
 *           enum: [FAQ, TEPA_SUMMARY, PRODUCT_DOC, POLICY]
 *       - in: query
 *         name: audienceRole
 *         schema:
 *           type: string
 *           enum: [TENANT, LANDLORD, COMMUNITY, INVESTOR, ALL]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor (last doc id from previous response)
 *     responses:
 *       200:
 *         description: List of docs and nextCursor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     docs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           title: { type: string }
 *                           sourceType: { type: string }
 *                           audienceRole: { type: string }
 *                           content: { type: string }
 *                           version: { type: string }
 *                           createdAt: { type: string, format: date-time }
 *                     nextCursor: { type: string, nullable: true }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get('/knowledge/docs', authMiddleware, listKnowledgeDocsHandler);

/**
 * @swagger
 * /api/ask-ai/knowledge/docs:
 *   post:
 *     tags: [Ask AI]
 *     summary: Create a knowledge doc
 *     description: Create a doc. Backend generates embedding from content. Requires Bearer JWT.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, sourceType, audienceRole, content, version]
 *             properties:
 *               title: { type: string, minLength: 1, maxLength: 500 }
 *               sourceType: { type: string, enum: [FAQ, TEPA_SUMMARY, PRODUCT_DOC, POLICY] }
 *               audienceRole: { type: string, enum: [TENANT, LANDLORD, COMMUNITY, INVESTOR, ALL] }
 *               content: { type: string, minLength: 1, maxLength: 50000 }
 *               version: { type: string, minLength: 1, maxLength: 50 }
 *     responses:
 *       201:
 *         description: Doc created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     title: { type: string }
 *                     sourceType: { type: string }
 *                     audienceRole: { type: string }
 *                     version: { type: string }
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/knowledge/docs', authMiddleware, createKnowledgeDocHandler);

/**
 * @swagger
 * /api/ask-ai/knowledge/search:
 *   post:
 *     tags: [Ask AI]
 *     summary: Vector search knowledge docs
 *     description: Embed the query and return similar docs. Optional role/sourceType filter. Requires Bearer JWT. Requires Atlas Vector Search index on askAiKnowledgeDocs.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query: { type: string, minLength: 1, maxLength: 2000 }
 *               limit: { type: integer, minimum: 1, maximum: 20, default: 5 }
 *               audienceRole: { type: string, enum: [tenant, landlord, community, investor, admin] }
 *               sourceType: { type: string, enum: [FAQ, TEPA_SUMMARY, PRODUCT_DOC, POLICY] }
 *     responses:
 *       200:
 *         description: Search results with scores
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           title: { type: string }
 *                           sourceType: { type: string }
 *                           audienceRole: { type: string }
 *                           content: { type: string }
 *                           version: { type: string }
 *                           score: { type: number }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/knowledge/search', authMiddleware, searchKnowledgeHandler);

/**
 * @swagger
 * /api/ask-ai/health:
 *   get:
 *     summary: Health check for Ask AI service
 *     description: Returns the health status of the Ask AI service powered by Gemini
 *     tags: [Ask AI]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 service:
 *                   type: string
 *                   example: "ask-ai"
 *                 status:
 *                   type: string
 *                   example: "healthy"
 *                 version:
 *                   type: string
 *                   example: "gemini-v1"
 *                 model:
 *                   type: string
 *                   example: "gemini-2.5-flash"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-01-21T12:00:00.000Z"
 */
router.get('/health', healthCheckController);

// Runtime kill-switch management endpoints (admin-only).
/**
 * @swagger
 * /api/ask-ai/admin/feature-flag:
 *   get:
 *     summary: Get Ask AI runtime feature flag status
 *     description: |
 *       Returns the effective Ask AI kill-switch status and its source.
 *       - source=runtime: status comes from DB toggle
 *       - source=env: no runtime override exists; env fallback is active
 *     tags: [Ask AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ask AI flag status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 requestId: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled: { type: boolean, example: true }
 *                     source: { type: string, enum: [runtime, env], example: runtime }
 *                     updatedAt: { type: string, nullable: true, format: date-time }
 *                     updatedByUserId: { type: string, nullable: true }
 *                 error: { type: object, nullable: true }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin only)
 */
router.get('/admin/feature-flag', authMiddleware, requireRole(['admin']), getAskAiFeatureFlagHandler);
/**
 * @swagger
 * /api/ask-ai/admin/feature-flag:
 *   patch:
 *     summary: Update Ask AI runtime feature flag
 *     description: |
 *       Admin kill switch for Ask AI. Changes take effect immediately without redeploy.
 *     tags: [Ask AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Ask AI flag updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 requestId: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled: { type: boolean, example: false }
 *                     source: { type: string, enum: [runtime, env], example: runtime }
 *                     updatedAt: { type: string, nullable: true, format: date-time }
 *                     updatedByUserId: { type: string, nullable: true }
 *                 error: { type: object, nullable: true }
 *       400:
 *         description: Validation error (enabled is required boolean)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin only)
 */
router.patch('/admin/feature-flag', authMiddleware, requireRole(['admin']), updateAskAiFeatureFlagHandler);

export default router;

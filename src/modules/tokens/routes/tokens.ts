import express from "express";
import { getTokens } from "../controllers/tokenController";


const router = express.Router();

/**
 * @swagger
 * /api/tokens:
 *   get:
 *     summary: Get all tokens
 *     tags: [Tokens]
 *     responses:
 *       200:
 *         description: List of tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Token'
 */
router.get('/', getTokens);


export default router;
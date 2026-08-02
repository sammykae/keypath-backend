import { Router } from "express";
import { listDeltas, mintBatch } from "../services/mirrorService";

const router = Router();

/**
 * @swagger
 * /api/tokenization/mirror/preview:
 *   get:
 *     summary: Preview mirror deltas
 *     tags: [Tokenization]
 *     responses:
 *       200:
 *         description: Mirror deltas preview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deltas:
 *                   type: array
 */
router.get("/preview", async (req, res) => {
  const deltas = await listDeltas(Date.now() - 24 * 3600 * 1000);
  res.json({ deltas });
});

/**
 * @swagger
 * /api/tokenization/mirror/status:
 *   get:
 *     summary: Get mirror status
 *     tags: [Tokenization]
 *     responses:
 *       200:
 *         description: Mirror status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 */
router.get("/status", async (req, res) => {
  res.json({ status: "off", message: "Mirror disabled in MVP phase" });
});

export default router;

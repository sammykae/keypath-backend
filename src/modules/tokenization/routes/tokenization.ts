import express from "express";
import { postTokenization } from "../../tokenization/controllers/tokenisationController";
import mirrorRouter from "./mirror";

const router = express.Router();

/**
 * @swagger
 * /api/tokenization/preview:
 *   post:
 *     summary: Preview tokenization configuration
 *     tags: [Tokenization]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               propertyId:
 *                 type: string
 *               config:
 *                 type: object
 *     responses:
 *       200:
 *         description: Tokenization preview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Validation error
 */
router.post("/preview", postTokenization);


router.use("/mirror", mirrorRouter);

export default router;

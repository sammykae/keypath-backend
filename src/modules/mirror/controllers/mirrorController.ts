import { Request, Response } from 'express';
import { listDeltas } from '../../tokens/services/tokenLedgerService';
import { reconcileOnChainSupply } from '../services/reconciliationService';
import { env } from '../../../core/config/env';
import { MirrorPreviewQuerySchema, ReconciliationQuerySchema } from '../dto/mirrorDTO';

/**
 * GET /admin/mirror/preview
 * Preview deltas that would be mirrored to blockchain
 */
export const getMirrorPreview = async (req: Request, res: Response) => {
  try {
    const query = MirrorPreviewQuerySchema.parse(req.query);
    const orgId = (req as any).user?.orgId?.toString();

    // Use orgId from auth context if not provided in query
    const options = {
      since: query.since,
      propertyId: query.propertyId,
      orgId: query.orgId || orgId
    };

    const deltas = await listDeltas(options);

    // Calculate total tokens
    const totalTokens = deltas.reduce((sum, delta) => sum + delta.amount, 0);

    res.json({
      deltas,
      totalTokens,
      count: deltas.length
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * GET /admin/mirror/status
 * Get current mirroring status
 */
export const getMirrorStatus = async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.orgId?.toString();
    
    // Get pending deltas count (deltas not yet mirrored)
    const pendingDeltas = await listDeltas({ orgId });
    const pendingCount = pendingDeltas.length;

    res.json({
      enabled: env.MIRROR_ENABLED === 'true',
      lastSync: null, // TODO: Store last sync timestamp when mirroring is implemented
      targetChains: ['Polygon', 'Base'] as const,
      pendingDeltas: pendingCount
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /admin/mirror/reconcile
 * Reconcile on-chain supply with MongoDB aggregates
 */
export const getReconciliation = async (req: Request, res: Response) => {
  try {
    const query = ReconciliationQuerySchema.parse(req.query);
    const orgId = (req as any).user?.orgId?.toString();

    const report = await reconcileOnChainSupply(
      query.propertyId,
      query.orgId || orgId
    );

    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};


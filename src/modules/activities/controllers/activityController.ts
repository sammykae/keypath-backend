import { Request, Response } from 'express';
import { getPropertyActivities } from '../services/activityService';
import { AppError } from '../../../core/errors/AppError';

/**
 * GET /api/properties/:id/activity?limit=50
 * Get activities for a specific property
 */
export const getPropertyActivity = async (req: Request, res: Response) => {
  try {
    const propertyId = req.params.id;
    const orgId = (req as any).user?.orgId || (req as any).orgId;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!orgId) {
      res.status(401).json({ error: 'Unauthorized: orgId required' });
      return;
    }

    if (!propertyId) {
      res.status(400).json({ error: 'Property ID is required' });
      return;
    }

    // Validate limit (max 100 to prevent abuse)
    const validatedLimit = Math.min(Math.max(1, limit), 100);

    const activities = await getPropertyActivities(propertyId, orgId, validatedLimit);

    res.status(200).json({
      total: activities.length,
      items: activities
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      console.error('Error fetching property activities:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

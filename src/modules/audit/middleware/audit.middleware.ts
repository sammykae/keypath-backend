import { Request, Response, NextFunction } from 'express';
import { writeAuditEvent } from '../services/audit.service';

interface AuditOptions {
  action: string;
  entityType: string;
  getEntityId?: (req: Request, res: Response) => any;
  getOrgId?: (req: Request, res: Response) => any;
}

export const auditMutation =
  (options: AuditOptions) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const actor = req.user as any;

    // Capture "before" snapshot if present
    const before = res.locals.beforeState;

    res.on('finish', async () => {
      // Only log successful mutations
      if (res.statusCode < 200 || res.statusCode >= 300) return;

      const after = res.locals.afterState;

      await writeAuditEvent({
        actorUserId: actor?._id,
        orgId: options.getOrgId?.(req, res),
        action: options.action,
        entityType: options.entityType,
        entityId: options.getEntityId?.(req, res),
        diff: before || after ? { before, after } : undefined,
      });
    });

    next();
  };

import { Router } from 'express';
import { authMiddleware } from '../../../middleware/authMiddleware';
import { requireRole } from '../../../middleware/rbac.middleware';
import { UserRole } from '../../auth/types/auth-user';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { Membership } from '../../orgs/models/membership.model';
import mongoose from 'mongoose';

const router = Router();

const COMMUNITY_ROLES: UserRole[] = ['community_stakeholder', 'COMMUNITY_STAKEHOLDER'] as UserRole[];

/**
 * GET /api/community/contacts
 * Returns landlords and admins in the same org as the community stakeholder.
 * Used by ChatInterface to populate "New Chat" contact list.
 */
router.get(
  '/community/contacts',
  authMiddleware,
  requireRole(COMMUNITY_ROLES),
  async (req, res) => {
    try {
      const userId = (req as any).auth?._id?.toString();
      if (!userId) return errorResponse(res, 401, 'UNAUTHORIZED', 'Not authenticated');

      const membership = await Membership.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        status: 'active'
      }).lean();

      if (!membership) return successResponse(res, { contacts: [] });

      const orgId = membership.orgId;

      const memberships = await Membership.find({
        orgId,
        status: 'active',
        userId: { $ne: new mongoose.Types.ObjectId(userId) }
      }).lean();

      const memberUserIds = memberships.map((m) => m.userId);

      const users = await mongoose.model('User').find({
        _id: { $in: memberUserIds },
        role: { $in: ['LANDLORD', 'landlord', 'ADMIN', 'admin'] }
      }).lean();

      const contacts = users.map((u: any) => ({
        userId: u._id.toString(),
        name: u.profile?.firstName
          ? `${u.profile.firstName} ${u.profile.lastName ?? ''}`.trim()
          : u.email.split('@')[0],
        email: u.email,
        avatarUrl: u.profile?.avatarUrl ?? null,
        role: u.role
      }));

      return successResponse(res, { contacts });
    } catch (err) {
      return errorResponse(res, 500, 'SERVER_ERROR', 'Failed to fetch contacts');
    }
  }
);

export default router;

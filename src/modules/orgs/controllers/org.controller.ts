import { Request, Response } from 'express';
import { Organization } from '../models/organization.model';
import { Membership } from '../models/membership.model';
import { successResponse ,errorResponse} from '../../../core/utils/response';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { Types } from 'mongoose';

export const createOrganization = async (req: Request, res: Response) => {
  const user = req.user as any;
  const { name, type } = req.body;

  const org = await Organization.create({
    name,
    type,
    primaryContactUserId: user._id,
  });

  await Membership.create({
    userId: user._id,
    orgId: org._id,
    roleInOrg: 'OWNER',
  });

  await writeAuditEvent({
    actorUserId: user._id,
    action: 'ORG_CREATED',
    entityType: 'Organization',
    entityId: org._id,
  });

  return successResponse(res, org, 201);
};

export const listMyOrganizations = async (req: Request, res: Response) => {
  const user = req.user as any;

  // Codex: only active memberships should appear in org context consumers.
  const memberships = await Membership.find({ userId: user._id, status: 'active' }).populate(
    'orgId'
  );

  return successResponse(
    res,
    memberships.map((m) => ({
      org: m.orgId,
      roleInOrg: m.roleInOrg,
    }))
  );
};


export const removeMember = async (req: Request, res: Response) => {
  const actor = req.user as any;
  const { orgId, userId } = req.params;

  // Codex: membership documents store user under `userId`, not bare `userId` param key.
  const membership = await Membership.findOne({ orgId, userId: userId });

  if (!membership) {
    return errorResponse(res, 404, 'NOT_FOUND', 'Membership not found');
  }

  await Membership.deleteOne({ _id: membership._id });

await writeAuditEvent({
  actorUserId: actor._id,
  orgId: new Types.ObjectId(orgId),
  action: 'MEMBER_REMOVED',
  entityType: 'Membership',
  entityId: membership._id,
  diff: {
    before: {
      userId: membership.userId,
      roleInOrg: membership.roleInOrg,
      status: membership.status,
    },
    after: null,
  },
});


  return successResponse(res, { message: 'Member removed successfully' });
};

export const getOrganizationById = async (req: Request, res: Response) => {
  const user = req.user as any;
  const { orgId } = req.params;

  // Must be a member to view
  const membership = await Membership.findOne({
    orgId,
    userId: user._id,
    // Codex: membership activity is tracked by `status`, not role value.
    status: { $ne: 'disabled' },
  });

  if (!membership) {
    return errorResponse(res, 403, 'FORBIDDEN', 'Not a member of this org');
  }

  const org = await Organization.findById(orgId);

  if (!org) {
    return errorResponse(res, 404, 'NOT_FOUND', 'Organization not found');
  }

  return successResponse(res, {
    id: org._id,
    name: org.name,
    type: org.type,
    createdAt: org.createdAt,
  });
};

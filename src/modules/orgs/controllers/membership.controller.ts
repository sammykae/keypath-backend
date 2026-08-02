import { Request, Response } from 'express';
import { Membership } from '../models/membership.model';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { writeAuditEvent } from '../../audit/services/audit.service';
import { Types } from 'mongoose';



/* -------------------------------------------------------------------------- */
/*                               ADD MEMBER                                   */
/* -------------------------------------------------------------------------- */

export const addMember = async (req: Request, res: Response) => {
  const actor = req.user as any;
  // Codex: support orgId from route params (preferred) with body fallback for backward compatibility.
  const orgId = req.params.orgId || req.body.orgId;
  const { userId, roleInOrg } = req.body;

  if (!orgId) {
    return errorResponse(res, 400, 'ORG_ID_REQUIRED', 'orgId is required');
  }

  if (!userId) {
    return errorResponse(res, 400, 'USER_ID_REQUIRED', 'userId is required');
  }

  if (!['OWNER', 'ADMIN', 'MEMBER'].includes(roleInOrg)) {
    return errorResponse(res, 400, 'INVALID_ROLE', 'roleInOrg must be OWNER, ADMIN, or MEMBER');
  }

  const exists = await Membership.findOne({ userId, orgId });
  if (exists) {
    return errorResponse(res, 409, 'MEMBERSHIP_EXISTS', 'User already in org');
  }

  const membership = await Membership.create({
    userId,
    orgId,
    roleInOrg,
    status: 'invited',
  });

  await writeAuditEvent({
    actorUserId: actor._id,
    orgId: new Types.ObjectId(orgId),
    action: 'MEMBER_ADDED',
    entityType: 'Membership',
    entityId: membership._id,
    diff: {
      before: null,
      after: {
        userId: membership.userId,
        roleInOrg: membership.roleInOrg,
        status: membership.status,
      },
    },
  });

  return successResponse(res, membership, 201);
};


export const listMembers = async (req: Request, res: Response) => {
  const { orgId } = req.params;

  const members = await Membership.find({ orgId })
    .populate('userId', 'email role');

  return successResponse(res, members);
};



export const updateMember = async (req: Request, res: Response) => {
  const actor = req.user as any;
  const { orgId, memberId } = req.params;
  const { roleInOrg, status } = req.body;

  // Codex: validate patch payload explicitly because this route currently has no zod validator.
  if (roleInOrg && !['OWNER', 'ADMIN', 'MEMBER'].includes(roleInOrg)) {
    return errorResponse(res, 400, 'INVALID_ROLE', 'roleInOrg must be OWNER, ADMIN, or MEMBER');
  }

  if (status && !['invited', 'active', 'disabled'].includes(status)) {
    return errorResponse(res, 400, 'INVALID_STATUS', 'status must be invited, active, or disabled');
  }
 
   //const membership = await Membership.findOne({ _id: memberId, orgId });

  // memberId can be the membership document _id or the user's _id (userId)
   let membership = await Membership.findOne({ _id: memberId, orgId });
  if (!membership) {
    membership = await Membership.findOne({ userId: memberId, orgId });
  } 
  if (!membership) {
    // Create membership if it doesn't exist (upsert-style)
    membership = await Membership.create({
      userId: memberId,
      orgId,
      roleInOrg: roleInOrg ?? 'MEMBER',
      status: status ?? 'active', 
    });
    await writeAuditEvent({
      actorUserId: actor._id,
      orgId: new Types.ObjectId(orgId),
      action: 'MEMBER_ADDED',
      entityType: 'Membership',
      entityId: membership._id,
      diff: {
        before: null,
        after: {
          userId: membership.userId,
          roleInOrg: membership.roleInOrg,
          status: membership.status,
        },
      },
    });
    return successResponse(res, membership, 201);
  }

  const before = {
    roleInOrg: membership.roleInOrg,
    status: membership.status,
  };

  membership.roleInOrg = roleInOrg ?? membership.roleInOrg;
  membership.status = status ?? membership.status;

  await membership.save();

  const after = {
    roleInOrg: membership.roleInOrg,
    status: membership.status,
  };

  await writeAuditEvent({
    actorUserId: actor._id,
    orgId: new Types.ObjectId(orgId),
    action: 'MEMBER_UPDATED',
    entityType: 'Membership',
    entityId: membership._id,
    diff: { before, after },
  });

  return successResponse(res, membership);
};

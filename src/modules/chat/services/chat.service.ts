import mongoose from 'mongoose';
import { emitToThread, emitToUser } from '../../../core/socket/socketServer';
import { ConversationModel, ConversationDocument } from '../models/conversationModel';
import { MessageModel, MessageDocument } from '../models/messageModel';
import {
  getAccessibleConversations,
  canAccessConversation,
  canSendMessage,
  canCreateConversation,
  resolveOrgIdForUser,
} from './participantRules.service';
import { User } from '../../auth/models/user.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { Organization } from '../../orgs/models/organization.model';
import { hasPMAccess } from '../../property-manager/services/propertyManager.service';
import { PropertyManagerAssignmentModel } from '../../property-manager/models/propertyManagerAssignment.model';
import { AppError } from '../../../core/errors/AppError';
import { ChatParticipantRole } from '../types/chat.types';
import { notify } from '../../notifications/services/notification.service';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const LAST_MESSAGE_PREVIEW_LENGTH = 100;

function toChatRole(role: string): ChatParticipantRole {
  const r = role?.toLowerCase();
  if (['tenant', 'landlord', 'community', 'investor', 'admin', 'property_manager'].includes(r)) return r as ChatParticipantRole;
  return 'tenant';
}

export interface ListThreadsOptions {
  userId: string;
  orgId: string | null;
  role: string;
  limit?: number;
  cursor?: string;
}

export interface ThreadSummary {
  threadId: string;
  title: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  participantAvatarUrl: string | null;
  participantName: string | null;
  propertyId: string | null;
  propertyName: string | null;
  propertyImageUrl: string | null;
}

export interface ListThreadsResult {
  threads: ThreadSummary[];
  nextCursor: string | null;
}

export interface GetMessagesOptions {
  conversationId: string;
  userId: string;
  limit?: number;
  cursor?: string;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  attachments: Array<{ id: string; fileName: string; fileType: string; fileSize: number; url: string }>;
  readBy: string[];
  createdAt: Date;
  deletedAt: Date | null;
}

export interface GetMessagesResult {
  messages: MessageItem[];
  nextCursor: string | null;
}

export interface SendMessageInput {
  conversationId: string;
  senderUserId: string;
  body: string;
  attachments?: Array<{ id: string; fileName: string; fileType: string; fileSize: number; url: string }>;
}

export interface CreateThreadInput {
  creatorUserId: string;
  orgId: string;
  participantUserIds: string[];
  title?: string | null;
  type?: 'direct' | 'group' | 'support';
}

export interface CreateThreadResult {
  threadId: string;
  title: string | null;
  participantIds: string[];
}

export async function createThread(input: CreateThreadInput): Promise<CreateThreadResult | null> {
  const { creatorUserId, orgId, participantUserIds, title = null, type = 'direct' } = input;
  const allIds = Array.from(new Set([creatorUserId, ...participantUserIds]));
  const access = await canCreateConversation(creatorUserId, allIds, orgId);
  if (!access.hasAccess) return null;

  const users = await User.find({ _id: { $in: allIds.map((id) => new mongoose.Types.ObjectId(id)) } }).lean();
  if (users.length !== allIds.length) return null;

  const roleByUserId = new Map<string, ChatParticipantRole>();
  for (const u of users) {
    roleByUserId.set(u._id.toString(), toChatRole(u.role));
  }

  const participants = allIds.map((id) => ({
    userId: new mongoose.Types.ObjectId(id),
    role: roleByUserId.get(id) ?? ('tenant' as ChatParticipantRole),
    joinedAt: new Date(),
    leftAt: undefined,
  }));

  const conv = await ConversationModel.create({
    orgId: new mongoose.Types.ObjectId(orgId),
    participants,
    title: title ?? undefined,
    type,
  });

  return {
    threadId: conv._id.toString(),
    title: conv.title ?? null,
    participantIds: conv.participants.map((p) => p.userId.toString()),
  };
}

/** Find existing direct thread between two users, or create one. */
export async function findOrCreateDirectThread(
  userAId: string,
  userBId: string,
  orgId: string,
  propertyId?: string
): Promise<{ threadId: string; isNew: boolean } | null> {
  const aOid = new mongoose.Types.ObjectId(userAId);
  const bOid = new mongoose.Types.ObjectId(userBId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  // Find existing thread scoped to same property (if provided) OR general thread if no property
  const baseFilter: any = {
    orgId: orgOid,
    type: 'direct',
    'participants.userId': { $all: [aOid, bOid] },
    deletedAt: null,
  };
  if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) {
    baseFilter.propertyId = new mongoose.Types.ObjectId(propertyId);
  } else {
    baseFilter.propertyId = { $in: [null, undefined] };
  }
  const existing = await ConversationModel.findOne(baseFilter).lean();

  if (existing) {
    return { threadId: existing._id.toString(), isNew: false };
  }

  const users = await User.find({ _id: { $in: [aOid, bOid] } }).lean();
  if (users.length !== 2) return null;

  const roleByUserId = new Map<string, ChatParticipantRole>();
  for (const u of users) {
    roleByUserId.set(u._id.toString(), toChatRole(u.role));
  }

  // Landlord direct-chat toggle: a tenant may only START a chat with a landlord
  // if the landlord org allows it. Existing threads remain accessible.
  if (roleByUserId.get(userAId) === 'tenant' && roleByUserId.get(userBId) === 'landlord') {
    const org = await Organization.findById(orgOid).lean();
    const allowed = org?.settings?.allowDirectTenantMessaging ?? true;
    if (!allowed) return null;
  }

  // Property Manager can only start a chat with a tenant on a property they
  // are assigned to, and only when they hold the MESSAGE_TENANT permission.
  const pmUserId =
    roleByUserId.get(userAId) === 'property_manager' ? userAId :
    roleByUserId.get(userBId) === 'property_manager' ? userBId : null;
  const tenantInPair =
    roleByUserId.get(userAId) === 'tenant' ? userAId :
    roleByUserId.get(userBId) === 'tenant' ? userBId : null;
  if (pmUserId && tenantInPair) {
    if (!propertyId) return null;
    const allowed = await hasPMAccess(new mongoose.Types.ObjectId(pmUserId), propertyId, 'MESSAGE_TENANT');
    if (!allowed) return null;
  }

  // Property Manager can only start a chat with the landlord tied to their own
  // assignment on this property, and only with the MESSAGE_LANDLORD permission.
  const landlordInPair =
    roleByUserId.get(userAId) === 'landlord' ? userAId :
    roleByUserId.get(userBId) === 'landlord' ? userBId : null;
  if (pmUserId && landlordInPair) {
    if (!propertyId) return null;
    const allowed = await hasPMAccess(new mongoose.Types.ObjectId(pmUserId), propertyId, 'MESSAGE_LANDLORD');
    if (!allowed) return null;
  }

  const participants = [userAId, userBId].map((id) => ({
    userId: new mongoose.Types.ObjectId(id),
    role: roleByUserId.get(id) ?? ('tenant' as ChatParticipantRole),
    joinedAt: new Date(),
  }));

  const userB = users.find(u => u._id.toString() === userBId);
  const title = userB
    ? `${(userB as any).profile?.firstName ?? ''} ${(userB as any).profile?.lastName ?? ''}`.trim() || (userB as any).email
    : null;

  const conv = await ConversationModel.create({
    orgId: orgOid,
    participants,
    title: title || null,
    type: 'direct',
    ...(propertyId ? { propertyId: new mongoose.Types.ObjectId(propertyId) } : {}),
  });

  return { threadId: conv._id.toString(), isNew: true };
}

/**
 * Property Manager initiates a direct chat with the landlord tied to their
 * own assignment on this property. The landlord identity is always derived
 * server-side from the assignment record — never taken from client input —
 * so a PM can't be tricked into (or attempt) messaging an arbitrary
 * landlord-role user in the org.
 */
export async function findOrCreatePMLandlordThread(
  pmUserId: string,
  propertyId: string
): Promise<{ threadId: string; isNew: boolean }> {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new AppError('Invalid propertyId', 400);
  const assignment = await PropertyManagerAssignmentModel.findOne({
    propertyManagerUserId: new mongoose.Types.ObjectId(pmUserId),
    propertyId: new mongoose.Types.ObjectId(propertyId),
    status: 'ACTIVE',
  }).lean();
  if (!assignment) throw new AppError('You are not assigned to this property', 403);
  if (!assignment.permissions.includes('MESSAGE_LANDLORD')) {
    throw new AppError('Missing MESSAGE_LANDLORD permission on this property', 403);
  }
  if (!assignment.landlordUserId) {
    throw new AppError('This property has no landlord to message (independent account)', 400);
  }

  const result = await findOrCreateDirectThread(
    pmUserId,
    assignment.landlordUserId.toString(),
    assignment.orgId.toString(),
    propertyId
  );
  if (!result) throw new AppError('Failed to create conversation', 500);
  return result;
}

/**
 * Property Manager creates a 3-party group thread (PM + landlord + tenant)
 * for an assigned tenant. Gated by BOTH the base MESSAGE_TENANT permission
 * and the assignment's allowGroupChat flag — off by default, the landlord
 * must explicitly enable it per assignment (Laurel, 2026-07-20).
 */
export async function findOrCreatePMGroupThread(
  pmUserId: string,
  propertyId: string,
  tenantUserId: string
): Promise<{ threadId: string; isNew: boolean }> {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new AppError('Invalid propertyId', 400);
  if (!mongoose.Types.ObjectId.isValid(tenantUserId)) throw new AppError('Invalid tenantUserId', 400);

  const assignment = await PropertyManagerAssignmentModel.findOne({
    propertyManagerUserId: new mongoose.Types.ObjectId(pmUserId),
    propertyId: new mongoose.Types.ObjectId(propertyId),
    status: 'ACTIVE',
  }).lean();
  if (!assignment) throw new AppError('You are not assigned to this property', 403);
  if (!assignment.permissions.includes('MESSAGE_TENANT')) {
    throw new AppError('Missing MESSAGE_TENANT permission on this property', 403);
  }
  if (!assignment.allowGroupChat) {
    throw new AppError('Group chat has not been authorized by the landlord for this assignment', 403);
  }
  if (!assignment.landlordUserId) {
    throw new AppError('This property has no landlord for a group chat (independent account)', 400);
  }

  // Confirm the tenant actually has an active tenancy on a unit within this
  // property (and within the unit-level restriction, if the assignment has one).
  const unitFilter: any = { propertyId: assignment.propertyId };
  if (assignment.unitIds && assignment.unitIds.length > 0) {
    unitFilter._id = { $in: assignment.unitIds };
  }
  const units = await UnitModel.find(unitFilter, '_id').lean();
  const unitIds = units.map((u: any) => u._id);
  const tenancy = await TenancyModel.findOne({
    tenantUserId: new mongoose.Types.ObjectId(tenantUserId),
    unitId: { $in: unitIds },
    status: 'ACTIVE',
  }).lean();
  if (!tenancy) throw new AppError('This tenant is not assigned to a unit you manage on this property', 403);

  const orgOid = assignment.orgId;
  const landlordUserId = assignment.landlordUserId;
  const allIds = [pmUserId, landlordUserId.toString(), tenantUserId];

  const existing = await ConversationModel.findOne({
    orgId: orgOid,
    type: 'group',
    propertyId: assignment.propertyId,
    'participants.userId': { $all: allIds.map((id) => new mongoose.Types.ObjectId(id)) },
    deletedAt: null,
  }).lean();
  if (existing) return { threadId: existing._id.toString(), isNew: false };

  const users = await User.find({ _id: { $in: allIds.map((id) => new mongoose.Types.ObjectId(id)) } }).lean();
  if (users.length !== allIds.length) throw new AppError('One or more participants could not be found', 404);
  const roleByUserId = new Map(users.map((u: any) => [u._id.toString(), toChatRole(u.role)]));

  const participants = allIds.map((id) => ({
    userId: new mongoose.Types.ObjectId(id),
    role: roleByUserId.get(id) ?? ('tenant' as ChatParticipantRole),
    joinedAt: new Date(),
  }));

  const property = await PropertyModel.findById(assignment.propertyId).lean();
  const conv = await ConversationModel.create({
    orgId: orgOid,
    participants,
    title: (property as any)?.name ? `${(property as any).name} — Group` : null,
    type: 'group',
    propertyId: assignment.propertyId,
  });

  return { threadId: conv._id.toString(), isNew: true };
}

export async function listThreads(options: ListThreadsOptions): Promise<ListThreadsResult> {
  const { userId, orgId, role, limit = DEFAULT_PAGE_SIZE, cursor } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const chatRole = toChatRole(role);

  const filter: mongoose.FilterQuery<ConversationDocument> = await getAccessibleConversations({
    userId,
    orgId: orgId ?? '',
    role: chatRole,
  });

  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    const cursorDoc = await ConversationModel.findOne({ _id: cursor, ...filter }).lean();
    if (cursorDoc) {
      const refDate = cursorDoc.lastMessageAt ?? cursorDoc.createdAt;
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { lastMessageAt: { $lt: refDate } },
            { lastMessageAt: refDate, _id: { $lt: cursorDoc._id } },
          ],
        },
      ];
    }
  }

  const conversations = await ConversationModel.find(filter)
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .limit(safeLimit + 1)
    .lean();
  const hasMore = conversations.length > safeLimit;
  const page = hasMore ? conversations.slice(0, safeLimit) : conversations;
  const nextCursor = hasMore && page.length ? page[page.length - 1]._id.toString() : null;

  const threads: ThreadSummary[] = await Promise.all(
    page.map(async (c) => {
      const lastMsg = await MessageModel.findOne({
        conversationId: c._id,
        deletedAt: null,
      })
        .sort({ createdAt: -1 })
        .limit(1)
        .lean();
      const preview = lastMsg?.body
        ? lastMsg.body.slice(0, LAST_MESSAGE_PREVIEW_LENGTH) + (lastMsg.body.length > LAST_MESSAGE_PREVIEW_LENGTH ? '…' : '')
        : null;
      const unreadCount = await MessageModel.countDocuments({
        conversationId: c._id,
        readBy: { $ne: new mongoose.Types.ObjectId(userId) },
        senderUserId: { $ne: new mongoose.Types.ObjectId(userId) },
        deletedAt: null,
      });
      // Get the other participant's profile for avatar
      const otherParticipantId = c.participants?.find(
        (p) => p.userId.toString() !== userId
      )?.userId;
      let participantAvatarUrl: string | null = null;
      let participantName: string | null = c.title ?? null;
      if (otherParticipantId) {
        const otherUser = await User.findById(otherParticipantId).lean();
        if (otherUser) {
          participantAvatarUrl = (otherUser as any).profile?.avatarUrl ?? null;
          const name = `${(otherUser as any).profile?.firstName ?? ''} ${(otherUser as any).profile?.lastName ?? ''}`.trim();
          participantName = name || (otherUser as any).email || c.title || null;
        }
      }

      // Resolve property info from conversation
      let propertyId: string | null = (c as any).propertyId?.toString() ?? null;
      let propertyName: string | null = null;
      let propertyImageUrl: string | null = null;
      if (propertyId) {
        const prop = await PropertyModel.findById(propertyId).lean();
        propertyName = (prop as any)?.name ?? null;
        propertyImageUrl = (prop as any)?.imageUrl ?? null;
      }

      return {
        threadId: c._id.toString(),
        title: participantName ?? c.title ?? null,
        lastMessagePreview: preview,
        lastMessageAt: c.lastMessageAt ?? null,
        unreadCount,
        participantAvatarUrl,
        participantName,
        propertyId,
        propertyName,
        propertyImageUrl,
      };
    })
  );

  return { threads, nextCursor };
}

export async function listTenantThreads(tenantUserId: string): Promise<{ threads: ThreadSummary[] }> {
  const orgId = await resolveOrgIdForUser(tenantUserId);
  const user = await User.findById(tenantUserId).lean();
  const role = user?.role ? toChatRole(user.role) : 'tenant';
  const result = await listThreads({
    userId: tenantUserId,
    orgId: orgId?.toString() ?? null,
    role,
    limit: 100,
  });
  return { threads: result.threads };
}

export async function getThread(
  threadId: string,
  userId: string
): Promise<{ threadId: string; title: string | null; participantIds: string[] } | null> {
  const access = await canAccessConversation(userId, threadId);
  if (!access.hasAccess) return null;

  const conv = await ConversationModel.findById(threadId).lean();
  if (!conv) return null;

  const participantIds = conv.participants
    .filter((p) => !p.leftAt)
    .map((p) => p.userId.toString());

  return {
    threadId: conv._id.toString(),
    title: conv.title ?? null,
    participantIds,
  };
}

export async function getMessages(options: GetMessagesOptions): Promise<GetMessagesResult | null> {
  const { conversationId, userId, limit = DEFAULT_PAGE_SIZE, cursor } = options;
  const access = await canAccessConversation(userId, conversationId);
  if (!access.hasAccess) return null;

  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const query: mongoose.FilterQuery<MessageDocument> = {
    conversationId: new mongoose.Types.ObjectId(conversationId),
    deletedAt: null,
  };

  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    const cursorDoc = await MessageModel.findOne({
      _id: cursor,
      conversationId: new mongoose.Types.ObjectId(conversationId),
      deletedAt: null,
    }).lean();
    if (cursorDoc) {
      query.$or = [
        { createdAt: { $lt: cursorDoc.createdAt } },
        { createdAt: cursorDoc.createdAt, _id: { $lt: cursorDoc._id } },
      ];
    }
  }

  const messages = await MessageModel.find(query)
    .sort({ createdAt: -1 })
    .limit(safeLimit + 1)
    .lean();

  const hasMore = messages.length > safeLimit;
  const page = hasMore ? messages.slice(0, safeLimit) : messages;
  const nextCursor = hasMore && page.length ? page[page.length - 1]._id.toString() : null;

  const items: MessageItem[] = page.map((m) => ({
    id: m._id.toString(),
    conversationId: m.conversationId.toString(),
    senderUserId: m.senderUserId.toString(),
    body: m.body,
    attachments: (m.attachments ?? []).map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileType: a.fileType,
      fileSize: a.fileSize,
      url: a.url,
    })),
    readBy: (m.readBy ?? []).map((id) => id.toString()),
    createdAt: m.createdAt,
    deletedAt: m.deletedAt ?? null,
  }));

  return { messages: items.reverse(), nextCursor };
}

/** Mark all unread messages in a thread as read for this user. */
export async function markThreadRead(threadId: string, userId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(threadId) || !mongoose.Types.ObjectId.isValid(userId)) return;
  const userOid = new mongoose.Types.ObjectId(userId);
  await MessageModel.updateMany(
    {
      conversationId: new mongoose.Types.ObjectId(threadId),
      readBy: { $ne: userOid },
      senderUserId: { $ne: userOid },
      deletedAt: null,
    },
    { $addToSet: { readBy: userOid } }
  );
}

export async function sendMessage(input: SendMessageInput): Promise<MessageItem | null> {
  const { conversationId, senderUserId, body, attachments = [] } = input;
  const access = await canSendMessage(senderUserId, conversationId);
  if (!access.hasAccess) return null;

  const conv = await ConversationModel.findById(conversationId);
  if (!conv) return null;

  const message = await MessageModel.create({
    conversationId: new mongoose.Types.ObjectId(conversationId),
    senderUserId: new mongoose.Types.ObjectId(senderUserId),
    body,
    attachments,
  });

  conv.lastMessageAt = new Date();
  await conv.save();

  const doc = await MessageModel.findById(message._id).lean();
  if (!doc) return null;

  const result: MessageItem = {
    id: doc._id.toString(),
    conversationId: doc.conversationId.toString(),
    senderUserId: doc.senderUserId.toString(),
    body: doc.body,
    attachments: (doc.attachments ?? []).map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileType: a.fileType,
      fileSize: a.fileSize,
      url: a.url,
    })),
    readBy: (doc.readBy ?? []).map((id) => id.toString()),
    createdAt: doc.createdAt,
    deletedAt: doc.deletedAt ?? null,
  };

  // Emit real-time to thread room
  emitToThread(conversationId, 'message:new', { threadId: conversationId, message: result });

  // Notify other participants' personal rooms for unread badge
  const notifiableRoles = new Set(['tenant', 'landlord', 'property_manager', 'admin']);
  for (const p of conv.participants) {
    if (p.userId.toString() !== senderUserId) {
      emitToUser(p.userId.toString(), 'thread:updated', {
        threadId: conversationId,
        lastMessagePreview: body.slice(0, 80),
        lastMessageAt: new Date().toISOString(),
      });

      if (notifiableRoles.has(p.role)) {
        notify({
          recipientId: p.userId,
          recipientRole: p.role as 'tenant' | 'landlord' | 'property_manager' | 'admin',
          eventType: 'CHAT_MESSAGE_RECEIVED',
          eventTitle: 'New message',
          eventDescription: body.slice(0, 200),
        });
      }
    }
  }

  return result;
}

/* -------------------------------------------------------------------------------------- */
/*  Landlord read-visibility into Property Manager ↔ Tenant threads                        */
/*  ("Landlord should be able to view the tenant/property manager chat for context" —      */
/*  Laurel's docs.) Landlord is NOT added as a participant — this is read-only and scoped   */
/*  to conversations in their own org that have both a PM and a tenant.                     */
/* -------------------------------------------------------------------------------------- */

export interface PMThreadSummary {
  threadId: string;
  propertyId: string | null;
  propertyName: string | null;
  tenantUserId: string | null;
  tenantName: string | null;
  propertyManagerUserId: string | null;
  propertyManagerName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
}

async function displayName(userId: mongoose.Types.ObjectId): Promise<string | null> {
  const u = await User.findById(userId).lean();
  if (!u) return null;
  const name = `${(u as any).profile?.firstName ?? ''} ${(u as any).profile?.lastName ?? ''}`.trim();
  return name || (u as any).email || null;
}

/** Landlord: list PM↔tenant conversation threads in their org, for context — read-only. */
export async function listPMTenantThreadsForOrg(
  orgId: mongoose.Types.ObjectId
): Promise<PMThreadSummary[]> {
  const conversations = await ConversationModel.find({
    orgId,
    type: 'direct',
    deletedAt: null,
    'participants.role': 'property_manager',
  })
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .limit(100)
    .lean();

  const pmTenantThreads = conversations.filter((c) => {
    const roles = new Set(c.participants.filter((p) => !p.leftAt).map((p) => p.role));
    return roles.has('property_manager') && roles.has('tenant');
  });

  return Promise.all(
    pmTenantThreads.map(async (c) => {
      const tenant = c.participants.find((p) => p.role === 'tenant');
      const pm = c.participants.find((p) => p.role === 'property_manager');
      const lastMsg = await MessageModel.findOne({ conversationId: c._id, deletedAt: null })
        .sort({ createdAt: -1 })
        .lean();
      const property = (c as any).propertyId ? await PropertyModel.findById((c as any).propertyId).lean() : null;

      return {
        threadId: c._id.toString(),
        propertyId: (c as any).propertyId?.toString() ?? null,
        propertyName: (property as any)?.name ?? null,
        tenantUserId: tenant?.userId.toString() ?? null,
        tenantName: tenant ? await displayName(tenant.userId) : null,
        propertyManagerUserId: pm?.userId.toString() ?? null,
        propertyManagerName: pm ? await displayName(pm.userId) : null,
        lastMessagePreview: lastMsg?.body
          ? lastMsg.body.slice(0, LAST_MESSAGE_PREVIEW_LENGTH) + (lastMsg.body.length > LAST_MESSAGE_PREVIEW_LENGTH ? '…' : '')
          : null,
        lastMessageAt: c.lastMessageAt ?? null,
      };
    })
  );
}

/** Landlord: read messages in a specific PM↔tenant thread in their org — read-only, no read-receipt side effects. */
export async function getPMThreadMessagesForLandlord(
  orgId: mongoose.Types.ObjectId,
  threadId: string
): Promise<MessageItem[] | null> {
  if (!mongoose.Types.ObjectId.isValid(threadId)) return null;

  const conv = await ConversationModel.findOne({ _id: threadId, orgId, deletedAt: null }).lean();
  if (!conv) return null;
  const roles = new Set(conv.participants.filter((p) => !p.leftAt).map((p) => p.role));
  if (!roles.has('property_manager') || !roles.has('tenant')) return null;

  const messages = await MessageModel.find({ conversationId: conv._id, deletedAt: null })
    .sort({ createdAt: -1 })
    .limit(MAX_PAGE_SIZE)
    .lean();

  return messages.reverse().map((m) => ({
    id: m._id.toString(),
    conversationId: m.conversationId.toString(),
    senderUserId: m.senderUserId.toString(),
    body: m.body,
    attachments: (m.attachments ?? []).map((a) => ({
      id: a.id, fileName: a.fileName, fileType: a.fileType, fileSize: a.fileSize, url: a.url,
    })),
    readBy: (m.readBy ?? []).map((id) => id.toString()),
    createdAt: m.createdAt,
    deletedAt: m.deletedAt ?? null,
  }));
}
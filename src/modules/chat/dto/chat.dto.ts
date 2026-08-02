import { z } from 'zod';
import { mongoIdSchema } from '../../../validators/common';

export const chatThreadIdParamSchema = z.object({
  id: mongoIdSchema,
});
export type ChatThreadIdParam = z.infer<typeof chatThreadIdParamSchema>;

export const listThreadsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(25),
  cursor: z.string().optional(),
});
export type ListThreadsQuery = z.infer<typeof listThreadsQuerySchema>;

export const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(25),
  cursor: z.string().optional(),
});
export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;

const messageAttachmentSchema = z.object({
  id: z.string().min(1).max(100),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().min(0).max(50 * 1024 * 1024),
  url: z.string().min(1).max(2048),
});

export const sendMessageBodySchema = z.object({
  body: z.string().min(1, 'Message body is required').max(10000),
  attachments: z.array(messageAttachmentSchema).max(10).optional().default([]),
});
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;

export const createThreadBodySchema = z.object({
  orgId: mongoIdSchema.optional(),
  participantUserIds: z.array(mongoIdSchema).min(0).max(20).optional().default([]),
  title: z.string().max(255).optional(),
  type: z.enum(['direct', 'group', 'support']).optional().default('direct'),
});
export type CreateThreadBody = z.infer<typeof createThreadBodySchema>;

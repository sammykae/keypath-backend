import { Request, Response, NextFunction } from 'express';
import { AskAiRequestSchema, AskAiResponseDTO, RetrieveDocsRequestSchema } from '../dto/askAi.dto';
import { AppError } from '../../../core/errors/AppError';
import { successResponse } from '../../../core/utils/response';
import { ZodError } from 'zod';
import { logger } from '../../../core/logger';
import { logAskAiActivity } from '../services/askAi.service';
import { buildRoleContext } from '../services/roleContext.service';
import { retrieveRelevantContext, retrieveRelevantDocs } from '../services/retrieval.service';
import { buildPrompt } from '../services/promptBuilder.service';
import { callGemini, callGeminiStream } from '../services/geminiProvider.service';
import {
  performSafetyCheck,
  sanitizeResponse,
  stripTrailingPartialCitations,
  stripMarkdown,
  truncateToWords,
  countWords,
  applyConfidenceFallback,
} from '../services/safety.service';
import {
  ASK_AI_CONFIG,
  STREAM_RAG_MAX_CHUNKS,
  ANSWER_MAX_WORDS_BY_MODE,
  type AnswerMode,
} from '../config/askAi.config';

const DETAIL_PATTERN = /(\bmore\s+detail|\bin\s+detail|\belaborate|\bexpand|\bexplain\s+fully|\btell\s+me\s+more|\bcan\s+you\s+expand)/i;
function getAnswerMode(question: string, answerMode?: AnswerMode): AnswerMode {
  if (answerMode) return answerMode;
  return DETAIL_PATTERN.test(question) ? 'deep' : 'brief';
}

interface AskAiRequestUser {
  userId: string;
  role: 'tenant' | 'landlord' |  'investor' | 'admin';
  orgId?: string | null;
}

const SSE_KEEPALIVE_MS = 15000;

const sendSseEvent = (res: Response, event: string, data: unknown): void => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }
};

export const askAiController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  const requestId = (req as any).id || crypto.randomUUID();

  try {
    const validatedBody = AskAiRequestSchema.parse(req.body);
    const { question, mode, context, answerMode: answerModeParam } = validatedBody;
    const answerMode = getAnswerMode(question, answerModeParam);
    const maxWords = ANSWER_MAX_WORDS_BY_MODE[answerMode];

    const tokenUser = (req as any).user as AskAiRequestUser | undefined;
    const isAuthenticated = !!tokenUser?.userId;

    if (!isAuthenticated && mode !== 'general') {
      throw new AppError(
        'Authentication required for role-specific questions. Use "general" mode for KeyPath and general real estate questions without signing in.',
        401
      );
    }

    const roleMap: Record<string, 'tenant' | 'landlord' | 'community' | 'investor' | 'admin'> = {
      tenant: 'tenant',
      landlord: 'landlord',
      stakeholder: 'community',
      admin: 'admin',
      TENANT: 'tenant',
      LANDLORD: 'landlord',
      COMMUNITY: 'community',
      INVESTOR: 'investor',
      ADMIN: 'admin',
    };
    const userRole = tokenUser?.role
      ? roleMap[tokenUser.role] || 'community'
      : 'community';
    const userId = tokenUser?.userId ?? 'anonymous';
    const userOrgId = context?.orgId ?? tokenUser?.orgId ?? 'default';

    const roleContext = buildRoleContext(userRole, userId, userOrgId);

    const safetyCheck = performSafetyCheck(question, roleContext);
    if (!safetyCheck.isSafe) {
      logger.warn(
        { requestId, blockedReasons: safetyCheck.blockedReasons },
        'Question blocked by safety check'
      );

      if (isAuthenticated) {
        await logAskAiActivity({
          userId,
          orgId: userOrgId,
          action: 'ASK_AI_BLOCKED',
          meta: {
            question: question.substring(0, 100),
            mode,
            model: ASK_AI_CONFIG.model,
            latencyMs: Date.now() - startTime,
          },
        });
      }

      res.status(400).json({
        answer: '',
        citations: [],
        safety: {
          blocked: true,
          reason: safetyCheck.blockedReasons.join('; '),
        },
        meta: {
          requestId,
          model: ASK_AI_CONFIG.model,
          latencyMs: Date.now() - startTime,
        },
        error: 'Question blocked by safety check',
      });
      return;
    }

    const sanitizedQuestion = safetyCheck.sanitizedQuery || question;

    if (isAuthenticated && tokenUser.userId) {
      await logAskAiActivity({
        userId: tokenUser.userId,
        orgId: userOrgId,
        action: 'ASK_AI_REQUESTED',
        meta: {
          question: question.substring(0, 100),
          mode,
          model: ASK_AI_CONFIG.model,
          latencyMs: 0,
        },
      });
    }

    const retrievalResult = await retrieveRelevantContext(sanitizedQuestion, roleContext, {
      maxChunks: STREAM_RAG_MAX_CHUNKS,
      propertyIdForContext: context?.propertyId,
    });

    const promptContext = {
      roleContext,
      query: sanitizedQuestion,
      retrievalResult,
      conversationHistory: undefined,
    };
    const { systemPrompt, userPrompt } = buildPrompt(promptContext);
    const promptLength = systemPrompt.length + userPrompt.length;

    logger.info({ requestId, role: userRole, mode }, 'Calling Gemini API');
    const geminiResponse = await callGemini(systemPrompt, userPrompt);

    let finalAnswer = sanitizeResponse(geminiResponse.text);
    finalAnswer = stripMarkdown(finalAnswer);
    finalAnswer = truncateToWords(finalAnswer, maxWords);

    const latencyMs = Date.now() - startTime;

    const chunkCount = retrievalResult.chunks.length;
    const avgScore =
      chunkCount > 0
        ? retrievalResult.scores.reduce((a, b) => a + b, 0) / chunkCount
        : 0;
    const confidence =
      chunkCount >= 2 && !retrievalResult.isFallback && avgScore >= 0.6
        ? 'high'
        : chunkCount >= 1
          ? 'medium'
          : 'low';

    finalAnswer = applyConfidenceFallback(finalAnswer, confidence);
    const outputWordCount = countWords(finalAnswer);

    const sourceIds = retrievalResult.chunks.map((c: any) =>
      c.chunkId ? String(c.chunkId) : c._id ? String(c._id) : ''
    ).filter(Boolean);

    const fallbackRate = retrievalResult.isFallback ? 1 : 0;

    logger.info(
      {
        requestId,
        promptLength,
        retrievedChunks: chunkCount,
        outputWordCount,
        latencyMs,
        fallbackRate,
        confidence,
        answerMode,
      },
      'Ask AI (non-stream) metrics'
    );

    if (isAuthenticated && tokenUser.userId) {
      await logAskAiActivity({
        userId: tokenUser.userId,
        orgId: userOrgId,
        action: 'ASK_AI_COMPLETED',
        meta: {
          question: question.substring(0, 100),
          mode,
          model: ASK_AI_CONFIG.model,
          latencyMs,
          promptLength,
          retrievedChunks: chunkCount,
          outputWordCount,
          fallbackRate,
          answerMode,
        },
      });
    }

    const response: AskAiResponseDTO = {
      answer: finalAnswer,
      confidence,
      source_ids: sourceIds,
      suggested_follow_up: '',
      citations: [],
      safety: {
        blocked: false,
      },
      meta: {
        requestId,
        model: ASK_AI_CONFIG.model,
        latencyMs,
        promptLength,
        retrievedChunks: chunkCount,
        outputWordCount,
        fallbackRate,
        answerMode,
      },
    };

    logger.info(
      { requestId, latencyMs, role: userRole, isAuthenticated },
      'Ask AI request completed'
    );

    res.status(200).json(response);
  } catch (error) {
    logger.error({ requestId, error }, 'Error in Ask AI controller');

    if (error instanceof ZodError) {
      res.status(400).json({
        answer: '',
        citations: [],
        safety: { blocked: true, reason: 'Validation failed' },
        meta: {
          requestId,
          model: ASK_AI_CONFIG.model,
          latencyMs: Date.now() - startTime,
        },
        error: 'Validation failed',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        answer: '',
        citations: [],
        safety: { blocked: true, reason: error.message },
        meta: {
          requestId,
          model: ASK_AI_CONFIG.model,
          latencyMs: Date.now() - startTime,
        },
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      answer: '',
      citations: [],
      safety: { blocked: true, reason: 'Internal server error' },
      meta: {
        requestId,
        model: ASK_AI_CONFIG.model,
        latencyMs: Date.now() - startTime,
      },
      error: 'An unexpected error occurred',
    });
  }
};

export const healthCheckController = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.status(200).json({
    success: true,
    service: 'ask-ai',
    status: 'healthy',
    version: 'gemini-v1',
    model: ASK_AI_CONFIG.model,
    timestamp: new Date().toISOString(),
  });
};

export const retrieveDocsController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = RetrieveDocsRequestSchema.parse(req.body);
    const docs = await retrieveRelevantDocs({
      question: body.question,
      role: body.role,
      topK: body.topK,
    });
    successResponse(res, { docs });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    next(error);
  }
};

export const askAiStreamController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const startTime = Date.now();
  const requestId = (req as any).id || crypto.randomUUID();

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (res.socket) {
    res.socket.setNoDelay(true);
    res.socket.setKeepAlive(true);
  }

  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  res.write(': stream-open\n\n');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  let isClosed = false;
  let streamEnded = false;
  const abortController = new AbortController();
  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  req.on('aborted', () => {
    isClosed = true;
    abortController.abort();
  });

  res.on('close', () => {
    isClosed = true;
    abortController.abort();
  });

  const endStream = () => {
    if (streamEnded) return;
    streamEnded = true;
    isClosed = true;
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      keepaliveInterval = null;
    }
    if (!res.writableEnded) res.end();
  };

  const safeSend = (event: string, data: unknown) => {
    if (isClosed) return;
    sendSseEvent(res, event, data);
  };

  try {
    const validatedBody = AskAiRequestSchema.parse(req.body);
    const { question, mode, context, answerMode: answerModeParam } = validatedBody;
    const answerMode = getAnswerMode(question, answerModeParam);
    const maxWords = ANSWER_MAX_WORDS_BY_MODE[answerMode];

    const tokenUser = (req as any).user as AskAiRequestUser | undefined;
    const isAuthenticated = !!tokenUser?.userId;


    // Map roles and modes
    const roleMap: Record<string, 'tenant' | 'landlord' | 'community' | 'investor' | 'admin'> = {
      tenant: 'tenant',
      landlord: 'landlord',
      stakeholder: 'community',
      admin: 'admin',
      TENANT: 'tenant',
      LANDLORD: 'landlord',
      COMMUNITY: 'community',
      INVESTOR: 'investor',
      ADMIN: 'admin',
    };
    const modeRoleMap: Record<string, 'tenant' | 'landlord' | 'community' | 'investor' | 'general'> = {
      tenant_dashboard: 'tenant',
      landlord_dashboard: 'landlord',
      community_dashboard: 'community',
      investor_dashboard: 'investor',
      general: 'general',
    };

    const userRole = tokenUser?.role ? roleMap[tokenUser.role] || 'community' : 'community';
    const userId = tokenUser?.userId ?? 'anonymous';
    const userOrgId = context?.orgId ?? tokenUser?.orgId ?? 'default';

    // RBAC gating
    if (!isAuthenticated && mode !== 'general') {
      throw new AppError(
        'Authentication required for role-specific questions. Use "general" mode for KeyPath and general real estate questions without signing in.',
        401
      );
    }
    if (isAuthenticated && mode !== 'general') {
      const requiredRole = modeRoleMap[mode];
      if (requiredRole && requiredRole !== 'general' && userRole !== requiredRole) {
        throw new AppError(
          `Forbidden: Your role (${userRole}) cannot access mode (${mode})`,
          403
        );
      }
    }

    const roleContext = buildRoleContext(userRole, userId, userOrgId);

    const safetyCheck = performSafetyCheck(question, roleContext);
    if (!safetyCheck.isSafe) {
      logger.warn(
        { requestId, blockedReasons: safetyCheck.blockedReasons },
        'Question blocked by safety check'
      );

      if (isAuthenticated) {
        await logAskAiActivity({
          userId,
          orgId: userOrgId,
          action: 'ASK_AI_BLOCKED',
          meta: {
            question: question.substring(0, 100),
            mode,
            model: ASK_AI_CONFIG.model,
            latencyMs: Date.now() - startTime,
          },
        });
      }

      safeSend('stream_error', {
        error: 'Question blocked by safety check',
        reason: safetyCheck.blockedReasons.join('; '),
        meta: {
          requestId,
          model: ASK_AI_CONFIG.model,
          latencyMs: Date.now() - startTime,
        },
      });
      endStream();
      return;
    }

    const sanitizedQuestion = safetyCheck.sanitizedQuery || question;

    if (isAuthenticated && tokenUser?.userId) {
      await logAskAiActivity({
        userId: tokenUser.userId,
        orgId: userOrgId,
        action: 'ASK_AI_REQUESTED',
        meta: {
          question: question.substring(0, 100),
          mode,
          model: ASK_AI_CONFIG.model,
          latencyMs: 0,
        },
      });
    }

    const retrievalResult = await retrieveRelevantContext(
      sanitizedQuestion,
      roleContext,
      { maxChunks: STREAM_RAG_MAX_CHUNKS, propertyIdForContext: context?.propertyId }
    );
    if (retrievalResult.chunks.length === 0) {
      logger.warn(
        { requestId, queryLength: sanitizedQuestion.length, role: userRole },
        'Stream: retrieval returned no knowledge base chunks; answer may not be citation-backed'
      );
    }

    const promptContext = {
      roleContext,
      query: sanitizedQuestion,
      retrievalResult,
      conversationHistory: undefined,
    };
    const { systemPrompt, userPrompt } = buildPrompt(promptContext);
    const promptLength = systemPrompt.length + userPrompt.length;

    safeSend('stream_start', {
      requestId,
      model: ASK_AI_CONFIG.model,
      mode,
      role: userRole,
    });

    keepaliveInterval = setInterval(() => {
      if (!isClosed && res.writable && !res.writableEnded) {
        res.write(`: keepalive ${Date.now()}\n\n`);
      }
    }, SSE_KEEPALIVE_MS);

    let fullText = '';
    let lastSentLength = 0;

    await callGeminiStream(
      systemPrompt,
      userPrompt,
      (delta) => {
        fullText += delta;
        let sanitizedSoFar = sanitizeResponse(fullText);
        sanitizedSoFar = stripMarkdown(sanitizedSoFar);
        let sanitizedDelta = sanitizedSoFar.slice(lastSentLength);
        sanitizedDelta = stripTrailingPartialCitations(sanitizedDelta);
        if (sanitizedDelta) {
          safeSend('stream_chunk', { delta: sanitizedDelta });
          lastSentLength += sanitizedDelta.length;
        }
      },
      abortController.signal
    );

    if (isClosed) {
      endStream();
      return;
    }

    let finalAnswer = sanitizeResponse(fullText);
    finalAnswer = stripMarkdown(finalAnswer);
    finalAnswer = truncateToWords(finalAnswer, maxWords);
    const latencyMs = Date.now() - startTime;

    const chunkCount = retrievalResult.chunks.length;
    const avgScore =
      chunkCount > 0
        ? retrievalResult.scores.reduce((a, b) => a + b, 0) / chunkCount
        : 0;
    const confidence =
      chunkCount >= 2 && !retrievalResult.isFallback && avgScore >= 0.6
        ? 'high'
        : chunkCount >= 1
          ? 'medium'
          : 'low';

    finalAnswer = applyConfidenceFallback(finalAnswer, confidence);
    const outputWordCount = countWords(finalAnswer);

    const sourceIds = retrievalResult.chunks.map((c: any) =>
      c.chunkId ? String(c.chunkId) : c._id ? String(c._id) : ''
    ).filter(Boolean);

    const fallbackRate = retrievalResult.isFallback ? 1 : 0;

    logger.info(
      {
        requestId,
        promptLength,
        retrievedChunks: chunkCount,
        outputWordCount,
        latencyMs,
        fallbackRate,
        confidence,
        answerMode,
      },
      'Ask AI stream metrics'
    );

    if (isAuthenticated && tokenUser?.userId) {
      await logAskAiActivity({
        userId: tokenUser.userId,
        orgId: userOrgId,
        action: 'ASK_AI_COMPLETED',
        meta: {
          question: question.substring(0, 100),
          mode,
          model: ASK_AI_CONFIG.model,
          latencyMs,
          promptLength,
          retrievedChunks: chunkCount,
          outputWordCount,
          fallbackRate,
          answerMode,
        },
      });
    }

    safeSend('stream_done', {
      answer: finalAnswer,
      confidence,
      source_ids: sourceIds,
      suggested_follow_up: '',
      citations: [],
      safety: { blocked: false },
      meta: {
        requestId,
        model: ASK_AI_CONFIG.model,
        latencyMs,
        promptLength,
        retrievedChunks: chunkCount,
        outputWordCount,
        fallbackRate,
        answerMode,
      },
    });

    endStream();
  } catch (error) {
    logger.error({ requestId, error }, 'Error in Ask AI streaming controller');

    if (isClosed) {
      return;
    }

    if (error instanceof ZodError) {
      safeSend('stream_error', {
        error: 'Validation failed',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
        meta: {
          requestId,
          model: ASK_AI_CONFIG.model,
          latencyMs: Date.now() - startTime,
        },
      });
      endStream();
      return;
    }

    if (error instanceof AppError) {
      safeSend('stream_error', {
        error: error.message,
        meta: {
          requestId,
          model: ASK_AI_CONFIG.model,
          latencyMs: Date.now() - startTime,
        },
      });
      endStream();
      return;
    }

    safeSend('stream_error', {
      error: 'An unexpected error occurred',
      meta: {
        requestId,
        model: ASK_AI_CONFIG.model,
        latencyMs: Date.now() - startTime,
      },
    });
    endStream();
  }
};

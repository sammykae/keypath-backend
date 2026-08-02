import { GoogleGenAI } from '@google/genai';
import { GeminiResponse } from '../types/askAi.types';
import { ASK_AI_CONFIG } from '../config/askAi.config';
import { AppError } from '../../../core/errors/AppError';
import { logger } from '../../../core/logger';

const GEMINI_TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS || '60000', 10);
const GEMINI_RETRY_ATTEMPTS = parseInt(process.env.GEMINI_RETRY_ATTEMPTS || '2', 10);
const GEMINI_RETRY_DELAY_MS = parseInt(process.env.GEMINI_RETRY_DELAY_MS || '1000', 10);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY as string,
});

const extractChunkText = (chunk: any): string => {
  if (!chunk) {
    return '';
  }

  if (typeof chunk.text === 'function') {
    const text = chunk.text();
    return typeof text === 'string' ? text : '';
  }

  if (typeof chunk.text === 'string') {
    return chunk.text;
  }

  const parts = chunk?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((part: any) => part?.text || '').join('');
  }

  return '';
};

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const err = error as any;
  const message = typeof err?.message === 'string' ? err.message : 'Unknown error';
  if (err?.code === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message))
    return new AppError('Rate limit exceeded. Please try again later.', 429);
  if (err?.code === 'ETIMEDOUT' || /timeout/i.test(message))
    return new AppError('AI service timeout. Please try again.', 504);
  return new AppError(`AI service error: ${message}`, 500);
}

function isRetriable(error: unknown): boolean {
  if (error instanceof AppError)
    return error.statusCode >= 500 || error.statusCode === 429 || error.statusCode === 504;
  return true;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const callGemini = async (
  systemPrompt: string,
  userPrompt: string
): Promise<GeminiResponse> => {
  const model = ASK_AI_CONFIG.model;
  const startTime = Date.now();

  logger.info({ model }, 'Calling Gemini API');

  const doCall = async (): Promise<GeminiResponse> => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), GEMINI_TIMEOUT_MS)
    );
    const callPromise = ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: ASK_AI_CONFIG.maxTokens,
        temperature: ASK_AI_CONFIG.temperature,
        topK: ASK_AI_CONFIG.topK,
      },
    });

    const response = await Promise.race([callPromise, timeoutPromise]);
    const text = response?.text || '';
    if (!text) throw new AppError('No response generated from AI', 502);
    return {
      text,
      finishReason: 'STOP',
      safetyRatings: [],
    };
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= GEMINI_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await doCall();
      logger.info(
        {
          responseLength: result.text.length,
          durationMs: Date.now() - startTime,
        },
        'Gemini response received'
      );
      return result;
    } catch (error) {
      lastError = error;
      logger.warn(
        { attempt, message: (error as any)?.message },
        'Gemini API call failed'
      );
      if (attempt < GEMINI_RETRY_ATTEMPTS && isRetriable(error))
        await sleep(GEMINI_RETRY_DELAY_MS);
      else break;
    }
  }

  throw toAppError(lastError);
};

export const callGeminiStream = async (
  systemPrompt: string,
  userPrompt: string,
  onChunk: (delta: string) => void,
  signal?: AbortSignal
): Promise<void> => {
  const model = ASK_AI_CONFIG.model;
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  logger.info({ model }, 'Calling Gemini streaming API');

  try {
    const stream = await ai.models.generateContentStream({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: ASK_AI_CONFIG.maxTokens,
        temperature: ASK_AI_CONFIG.temperature,
        topK: ASK_AI_CONFIG.topK,
      },
      signal: controller.signal,
    } as any);

    for await (const chunk of stream as any) {
      const delta = extractChunkText(chunk);
      if (delta) onChunk(delta);
    }
    clearTimeout(timeoutId);
    logger.info({ durationMs: Date.now() - startTime }, 'Gemini streaming completed');
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    logger.warn(
      { message: (error as any)?.message },
      'Gemini streaming API call failed'
    );
    throw toAppError(error);
  }
};

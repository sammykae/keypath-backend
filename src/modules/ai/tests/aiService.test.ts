import { generateAIResponse } from '../services/ai.service';
import * as embedderService from '../services/embedder.service';
import * as knowledgeService from '../services/knowledge.service';
import { AppError } from '../../../core/errors/AppError';

jest.mock('../services/embedder.service');
jest.mock('../services/knowledge.service');
jest.mock('@google/genai', () => {
  const mockGenerateContent = jest.fn();
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: { generateContent: mockGenerateContent },
    })),
    mockGenerateContent,
  };
});

const { mockGenerateContent } = jest.requireMock('@google/genai');

describe('AI Service', () => {
  const mockEmbedding = new Array(768).fill(0.1);
  const validInput = { message: 'What is TEPA?', persona: 'tenant', route_summary: 'test' };

  beforeEach(() => {
    jest.clearAllMocks();
    (embedderService.embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);
    (knowledgeService.vectorSimilaritySearch as jest.Mock).mockResolvedValue([]);
    mockGenerateContent.mockResolvedValue({ text: 'AI response' });
  });

  it('returns AI response on success', async () => {
    const result = await generateAIResponse(validInput);

    expect(result).toHaveProperty('text');
    expect(result.text).toBe('AI response');
  });

  it('throws AppError when embedding fails', async () => {
    (embedderService.embedQuery as jest.Mock).mockRejectedValue(new Error('Embedding failed'));

    await expect(generateAIResponse(validInput)).rejects.toThrow(AppError);
  });

  it('throws AppError when vector search fails', async () => {
    (knowledgeService.vectorSimilaritySearch as jest.Mock).mockRejectedValue(new Error('Search failed'));

    await expect(generateAIResponse(validInput)).rejects.toThrow(AppError);
  });

  it('throws AppError when generation fails', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Generation failed'));

    await expect(generateAIResponse(validInput)).rejects.toThrow(AppError);
  });

  it('throws 429 on rate limit error', async () => {
    const error = new Error('RESOURCE_EXHAUSTED');
    (error as any).code = 429;
    mockGenerateContent.mockRejectedValue(error);

    await expect(generateAIResponse(validInput)).rejects.toMatchObject({ statusCode: 429 });
  });

  it('throws 504 on timeout error', async () => {
    const error = new Error('timeout');
    (error as any).code = 'ETIMEDOUT';
    mockGenerateContent.mockRejectedValue(error);

    await expect(generateAIResponse(validInput)).rejects.toMatchObject({ statusCode: 504 });
  });

  it('throws 502 when no response generated', async () => {
    mockGenerateContent.mockResolvedValue({ text: null });

    await expect(generateAIResponse(validInput)).rejects.toMatchObject({ statusCode: 502 });
  });
});

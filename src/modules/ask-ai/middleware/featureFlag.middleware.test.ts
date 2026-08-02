import { Request, Response, NextFunction } from 'express';
import { askAiFeatureFlagMiddleware } from './featureFlag.middleware';
import { isAskAiEnabledRuntime } from '../services/askAiFeatureFlag.service';

jest.mock('../../../core/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../services/askAiFeatureFlag.service', () => ({
  isAskAiEnabledRuntime: jest.fn(),
}));

describe('askAiFeatureFlagMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  const mockIsAskAiEnabledRuntime = isAskAiEnabledRuntime as jest.MockedFunction<typeof isAskAiEnabledRuntime>;

  beforeEach(() => {
    req = { path: '/api/ask-ai', method: 'POST' };
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    res = {
      status: statusMock as unknown as Response['status'],
      locals: {},
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('returns 503 with standard error response when kill switch is off', async () => {
    // Kill switch OFF should short-circuit request handling.
    mockIsAskAiEnabledRuntime.mockResolvedValue(false);

    askAiFeatureFlagMiddleware(req as Request, res as Response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(statusMock).toHaveBeenCalledWith(503);
    const payload = jsonMock.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.data).toBeNull();
    expect(payload.error).toEqual({
      code: 'ASK_AI_DISABLED',
      message: 'The Ask AI feature is currently disabled. Please try again later.',
      details: undefined,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when kill switch is on', async () => {
    // Kill switch ON should allow downstream Ask AI handlers.
    mockIsAskAiEnabledRuntime.mockResolvedValue(true);

    askAiFeatureFlagMiddleware(req as Request, res as Response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
  });
});

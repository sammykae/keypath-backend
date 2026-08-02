import { askAiController } from "../controllers/ai.controller";
import * as aiService from '../services/ai.service';
import * as chatService from '../services/chat.service';
import { Request, Response } from 'express';
import { AppError } from '../../../core/errors/AppError';

jest.mock('../services/ai.service');
jest.mock('../services/chat.service');

describe('AI Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    res = {
      status: statusMock,
      json: jsonMock
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 if message is missing", async () => {
    req = { body: { session_id: "123", context: { persona: "tenant", route_summary: "test" } } };
    await askAiController(req as Request, res as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: "User message is required" });
  });

  it("returns 400 if session_id is missing", async () => {
    req = { body: { message: "Hello", context: { persona: "tenant", route_summary: "test" } } };
    await askAiController(req as Request, res as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Session ID is required" });
  });

  it("returns 400 if context is missing", async () => {
    req = { body: { message: "Hello", session_id: "123" } };
    await askAiController(req as Request, res as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Context is required" });
  });

  it("returns 400 if persona is missing", async () => {
    req = { body: { message: "Hello", session_id: "123", context: { route_summary: "test" } } };
    await askAiController(req as Request, res as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Persona is required" });
  });

  it("returns 400 if route_summary is missing", async () => {
    req = { body: { message: "Hello", session_id: "123", context: { persona: "tenant" } } };
    await askAiController(req as Request, res as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Route summary is required and must be a string" });
  });

  it("returns AI response on success", async () => {
    (chatService.updateSession as jest.Mock).mockResolvedValue({});
    (chatService.saveUserMessage as jest.Mock).mockResolvedValue({});
    (aiService.generateAIResponse as jest.Mock).mockResolvedValue({ text: "AI response" });
    (chatService.saveGeminiAIMessage as jest.Mock).mockResolvedValue({});

    req = { body: { message: "Hello", session_id: "123", context: { persona: "tenant", route_summary: "test" } } };
    await askAiController(req as Request, res as Response, jest.fn());

    expect(jsonMock).toHaveBeenCalledWith({ session_id: "123", text: "AI response" });
  });

  it("returns AppError status code on AppError", async () => {
    (chatService.updateSession as jest.Mock).mockRejectedValue(new AppError("Rate limit", 429));

    req = { body: { message: "Hello", session_id: "123", context: { persona: "tenant", route_summary: "test" } } };
    await askAiController(req as Request, res as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(429);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Rate limit" });
  });

  it("returns 500 on generic error", async () => {
    (chatService.updateSession as jest.Mock).mockRejectedValue(new Error("Something broke"));

    req = { body: { message: "Hello", session_id: "123", context: { persona: "tenant", route_summary: "test" } } };
    await askAiController(req as Request, res as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Failed to generate AI response" });
  });
});

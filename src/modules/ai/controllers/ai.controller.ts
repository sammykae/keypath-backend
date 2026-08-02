import { Request, Response } from "express";
import type { RequestHandler } from "express";
import { generateAIResponse } from '../services/ai.service';
import { 
  updateSession, 
  saveUserMessage, 
  saveGeminiAIMessage 
} from '../services/chat.service';
import { AppError } from '../../../core/errors/AppError';


export const askAiController: RequestHandler = async (req, res) => {
  try {
    const { 
      message,
      session_id,
      context
    } = req.body;
    
    if (!message) {
      res.status(400).json({ error: "User message is required" });
      return;
    }
    
    if (!session_id) {
      res.status(400).json({ error: "Session ID is required" });
      return;
    }
    
    if (!context) {
      res.status(400).json({ error: "Context is required" });
      return;
    }

    const { route_summary, persona } = context;

    if (!route_summary) {
      res.status(400).json({ error: "Route summary is required and must be a string" });
      return;
    }
    
    if (!persona) {
      res.status(400).json({ error: "Persona is required" });
      return;
    }
    
    await updateSession(session_id, persona, route_summary);

    const context_snapshot = { persona, route_summary };
    await saveUserMessage(session_id, message, context_snapshot);

    
    const { text } = await generateAIResponse({
      message,
      persona,
      route_summary,
    });

    await saveGeminiAIMessage(
      session_id,
      text,
      context_snapshot
    );

   
    res.json({
      session_id,
      text
    });
    return;


     
  } catch (error: any) {
    console.error("Error in askAiController:", error);
    
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ 
        error: error.message
      });
      return;
    }
    
    res.status(500).json({ 
      error: "Failed to generate AI response"
    });
    return;
  }
};

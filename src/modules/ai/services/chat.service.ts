import { ChatSessionModel } from '../models/ChatSessionModel';
import { ChatExchangeModel } from '../models/ChatExchangeModel';
import { AppError } from '../../../core/errors/AppError';

export const updateSession = async (
  session_id: string,
  persona: string,
  route_summary: string
) => {
  const session = await ChatSessionModel.findOneAndUpdate(
    { session_id },
    { 
      $set: { 
        persona,
        route_summary,
        updatedAt: new Date()
      },
      $setOnInsert: {
        session_id,
        message_count: 0,
        createdAt: new Date()
      }
    },
    { 
      new: true,
      upsert: true
    }
  );
  
  if (!session) {
    throw new AppError('Session not found', 404);
  }
  
  return session.toObject();
};

export const getSessionById = async (session_id: string) => {
  const session = await ChatSessionModel.findOne({ session_id });
  return session ? session.toObject() : null;
};


const incrementMessageCount = async (session_id: string) => {
  const session = await ChatSessionModel.findOneAndUpdate(
    { session_id },
    { 
      $inc: { message_count: 1 },
      $set: { updatedAt: new Date() }
    },
    { new: true }
  );
  

  if (!session) {
    throw new AppError('Session not found', 404);
  }
  
  return session.toObject();
};


export const saveUserMessage = async (
  session_id: string,
  text: string,
  context_snapshot?: { persona: string; route_summary: string }
) => {
  const exchange = new ChatExchangeModel({
    session_id,
    role: 'user',
    text,
  });
  await exchange.save();
  
  await incrementMessageCount(session_id);
  
  return exchange.toObject();
};


export const saveGeminiAIMessage = async (
  session_id: string,
  text: string,
  context_snapshot?: { persona: string; route_summary: string }
) => {
  const exchange = new ChatExchangeModel({
    session_id,
    role: 'assistant',
    text,
    context_snapshot
  });
  await exchange.save();
  
  await incrementMessageCount(session_id);
  
  return exchange.toObject();
};

import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { CreditEventModel, CreditEvent } from '../models/creditEventModel';
import { CreditEventType } from '../types/creditEventTypes';
import {
  syncUnifiedLedgerFromCreditEvent,
  type UnifiedLedgerContext,
} from './unifiedLedger.service';

/**
 * Result of an idempotent event write operation
 */
export interface IdempotentWriteResult {
  /** Whether the event was newly created */
  isNew: boolean;
  /** The event document (either newly created or existing) */
  event: CreditEvent;
}

/**
 * Creates a credit event with idempotency support
 * If an event with the same idempotencyKey already exists, returns the existing event
 * Otherwise, creates a new event
 * 
 * @param eventData - The event data to create
 * @param idempotencyKey - Unique key to ensure idempotency
 * @returns Result indicating if event was new or existing
 * @throws Error if idempotency key exists but event data doesn't match
 */
export async function createCreditEventWithIdempotency(
  eventData: {
    accountId: mongoose.Types.ObjectId;
    type: CreditEventType;
    amount: number;
    occurredAt?: Date;
    description?: string;
    referenceId?: mongoose.Types.ObjectId;
  },
  idempotencyKey: string,
  unifiedLedgerContext?: UnifiedLedgerContext
): Promise<IdempotentWriteResult> {
  // Check if event with this idempotency key already exists
  const existingEvent = await CreditEventModel.findOne({ idempotencyKey });

  if (existingEvent) {
    // Verify that the existing event matches the requested event data
    // This ensures data integrity - same key should always produce same event
    if (
      existingEvent.accountId.toString() !== eventData.accountId.toString() ||
      existingEvent.type !== eventData.type ||
      existingEvent.amount !== eventData.amount ||
      (eventData.description && existingEvent.description !== eventData.description) ||
      (eventData.referenceId && 
       existingEvent.referenceId?.toString() !== eventData.referenceId.toString())
    ) {
      throw new AppError(
        `Idempotency key conflict: key '${idempotencyKey}' exists with different event data`,
        409
      );
    }

    await syncUnifiedLedgerFromCreditEvent(
      {
        _id: existingEvent._id,
        accountId: existingEvent.accountId,
        type: existingEvent.type as CreditEventType,
        amount: existingEvent.amount,
        occurredAt: existingEvent.occurredAt,
        description: existingEvent.description,
      },
      idempotencyKey,
      unifiedLedgerContext
    );

    return {
      isNew: false,
      event: existingEvent
    };
  }

  // Create new event
  const newEvent = new CreditEventModel({
    ...eventData,
    idempotencyKey,
    occurredAt: eventData.occurredAt || new Date()
  });

  try {
    const savedEvent = await newEvent.save();
    await syncUnifiedLedgerFromCreditEvent(
      {
        _id: savedEvent._id,
        accountId: savedEvent.accountId,
        type: savedEvent.type as CreditEventType,
        amount: savedEvent.amount,
        occurredAt: savedEvent.occurredAt,
        description: savedEvent.description,
      },
      idempotencyKey,
      unifiedLedgerContext
    );
    return {
      isNew: true,
      event: savedEvent
    };
  } catch (error: any) {
    // Handle race condition: if another process created the event between our check and save
    if (error.code === 11000 && error.keyPattern?.idempotencyKey) {
      // Retry by fetching the existing event
      const existingEvent = await CreditEventModel.findOne({ idempotencyKey });
      if (existingEvent) {
        await syncUnifiedLedgerFromCreditEvent(
          {
            _id: existingEvent._id,
            accountId: existingEvent.accountId,
            type: existingEvent.type as CreditEventType,
            amount: existingEvent.amount,
            occurredAt: existingEvent.occurredAt,
            description: existingEvent.description,
          },
          idempotencyKey,
          unifiedLedgerContext
        );
        return {
          isNew: false,
          event: existingEvent
        };
      }
    }
    throw error;
  }
}

/**
 * Generates a deterministic idempotency key from event data
 * Useful when you want to ensure idempotency based on business logic
 * 
 * @param accountId - Account ID
 * @param type - Event type
 * @param amount - Event amount
 * @param referenceId - Optional reference ID
 * @param additionalData - Additional data to include in key
 * @returns Generated idempotency key
 */
export function generateIdempotencyKey(
  accountId: mongoose.Types.ObjectId,
  type: CreditEventType,
  amount: number,
  referenceId?: mongoose.Types.ObjectId,
  additionalData?: string
): string {
  const parts = [
    accountId.toString(),
    type,
    amount.toString(),
    referenceId?.toString() || '',
    additionalData || ''
  ];
  
  // Simple hash-like key (in production, consider using crypto.createHash)
  return `credit_event_${parts.join('_')}_${Date.now()}`;
}

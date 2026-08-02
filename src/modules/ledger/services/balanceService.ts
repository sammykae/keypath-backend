import mongoose from 'mongoose';
import { CreditEventModel } from '../models/creditEventModel';
import { CreditBalanceSnapshotModel } from '../models/creditBalanceSnapshotModel';
import { CreditEventType } from '../types/creditEventTypes';

/**
 * Computes the balance for an account by summing all credit events
 * This is the authoritative source of truth - balance is always derived from events
 * 
 * @param accountId - The account ID to compute balance for
 * @param asOf - Optional date to compute balance as of a specific time
 * @returns The computed balance
 */
export async function computeBalance(
  accountId: mongoose.Types.ObjectId,
  asOf?: Date
): Promise<number> {
  const query: any = { accountId };
  
  if (asOf) {
    query.occurredAt = { $lte: asOf };
  }

  const events = await CreditEventModel.find(query).sort({ occurredAt: 1, createdAt: 1 });

  let balance = 0;

  for (const event of events) {
    switch (event.type) {
      case CreditEventType.CREDIT:
      case CreditEventType.TRANSFER_IN:
      case CreditEventType.REFUND:
        balance += event.amount;
        break;
      
      case CreditEventType.DEBIT:
      case CreditEventType.TRANSFER_OUT:
      case CreditEventType.REDEMPTION:
      case CreditEventType.EXPIRATION:
        balance -= event.amount;
        break;
      
      case CreditEventType.ADJUSTMENT:
        // Adjustments can be positive or negative based on amount sign
        balance += event.amount;
        break;
      
      default:
        // Unknown event type - log warning but don't break
        console.warn(`Unknown credit event type: ${event.type} for event ${event._id}`);
    }
  }

  return balance;
}

/**
 * Gets the balance for an account, optionally using a snapshot for performance
 * Falls back to computing from events if no snapshot is available or is stale
 * 
 * @param accountId - The account ID to get balance for
 * @param useSnapshot - Whether to use snapshot if available (default: true)
 * @param maxSnapshotAge - Maximum age of snapshot in milliseconds (default: 1 hour)
 * @returns The account balance
 */
export async function getBalance(
  accountId: mongoose.Types.ObjectId,
  useSnapshot: boolean = true,
  maxSnapshotAge: number = 3600000 // 1 hour
): Promise<number> {
  if (useSnapshot) {
    const snapshot = await CreditBalanceSnapshotModel
      .findOne({ accountId })
      .sort({ asOf: -1 })
      .limit(1);

    if (snapshot) {
      const snapshotAge = Date.now() - snapshot.asOf.getTime();
      
      // If snapshot is recent enough, compute balance from snapshot forward
      if (snapshotAge <= maxSnapshotAge) {
        const eventsAfterSnapshot = await CreditEventModel.find({
          accountId,
          occurredAt: { $gt: snapshot.asOf }
        }).sort({ occurredAt: 1, createdAt: 1 });

        let balance = snapshot.balance;

        for (const event of eventsAfterSnapshot) {
          switch (event.type) {
            case CreditEventType.CREDIT:
            case CreditEventType.TRANSFER_IN:
            case CreditEventType.REFUND:
              balance += event.amount;
              break;
            
            case CreditEventType.DEBIT:
            case CreditEventType.TRANSFER_OUT:
            case CreditEventType.REDEMPTION:
            case CreditEventType.EXPIRATION:
              balance -= event.amount;
              break;
            
            case CreditEventType.ADJUSTMENT:
              balance += event.amount;
              break;
          }
        }

        return balance;
      }
    }
  }

  // Fall back to full computation from events
  return computeBalance(accountId);
}

/**
 * Creates a balance snapshot for an account at the current time
 * Useful for performance optimization when balance computation becomes expensive
 * 
 * @param accountId - The account ID to create snapshot for
 * @returns The created snapshot
 */
export async function createBalanceSnapshot(
  accountId: mongoose.Types.ObjectId
): Promise<mongoose.Document> {
  const balance = await computeBalance(accountId);
  const asOf = new Date();

  const snapshot = new CreditBalanceSnapshotModel({
    accountId,
    balance,
    asOf
  });

  return snapshot.save();
}

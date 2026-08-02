import { CreditAccountModel } from "../models/creditAccountModel";
import { 
  createCreditEventWithIdempotency,
  generateIdempotencyKey 
} from "./idempotencyService";
import { CreateCreditEventDTO, CreateCreditAccountDTO } from "../dto/ledgerDTO";
import { AppError } from "../../../core/errors/AppError";
import mongoose from "mongoose";
import { CreditEventType } from "../types/creditEventTypes";

/**
 * Creates or finds a credit account for a tenant
 */
export const findOrCreateCreditAccount = async (
  data: CreateCreditAccountDTO
) => {
  if (!mongoose.Types.ObjectId.isValid(data.tenantUserId)) {
    throw new AppError('Invalid tenant user ID', 400);
  }
  const accountData: any = {
    tenantUserId: new mongoose.Types.ObjectId(data.tenantUserId),
    createdAt: new Date()
  };

  if (data.orgId && mongoose.Types.ObjectId.isValid(data.orgId)) {
    accountData.orgId = new mongoose.Types.ObjectId(data.orgId);
  }
  if (data.unitId && mongoose.Types.ObjectId.isValid(data.unitId)) {
    accountData.unitId = new mongoose.Types.ObjectId(data.unitId);
  }

  // Try to find existing account with same criteria
  const existingAccount = await CreditAccountModel.findOne({
    tenantUserId: accountData.tenantUserId,
    orgId: accountData.orgId || null,
    unitId: accountData.unitId || null
  }).lean();

  if (existingAccount) {
    return existingAccount;
  }

  // Create new account
  const newAccount = new CreditAccountModel(accountData);
  await newAccount.save();
  return newAccount.toObject();
};

/**
 * Creates a credit event with idempotency support
 */
export const createCreditEvent = async (data: CreateCreditEventDTO) => {
  // Validate account exists
  if (!mongoose.Types.ObjectId.isValid(data.accountId)) {
    throw new AppError("Invalid account ID", 400);
  }

  const account = await CreditAccountModel.findById(data.accountId).lean();
  if (!account) {
    throw new AppError("Credit account not found", 404);
  }

  // referenceId is optional; if provided it must be a valid ObjectId (e.g. transaction/order ID from another collection)
  const referenceIdObj =
    data.referenceId && mongoose.Types.ObjectId.isValid(data.referenceId)
      ? new mongoose.Types.ObjectId(data.referenceId)
      : undefined;
  if (data.referenceId != null && data.referenceId !== "" && !referenceIdObj) {
    throw new AppError("referenceId must be a valid ObjectId when provided", 400);
  }

  // Use provided idempotency key or generate one
  const idempotencyKey = data.idempotencyKey || generateIdempotencyKey(
    new mongoose.Types.ObjectId(data.accountId),
    data.type,
    data.amount,
    referenceIdObj
  );

  const unifiedLedgerContext =
    data.eventType || data.propertyId
      ? {
          businessEventType: data.eventType,
          propertyId:
            data.propertyId && mongoose.Types.ObjectId.isValid(data.propertyId)
              ? new mongoose.Types.ObjectId(data.propertyId)
              : undefined,
        }
      : undefined;

  // Create event with idempotency
  const result = await createCreditEventWithIdempotency(
    {
      accountId: new mongoose.Types.ObjectId(data.accountId),
      type: data.type,
      amount: data.amount,
      occurredAt: data.occurredAt || new Date(),
      description: data.description,
      referenceId: referenceIdObj
    },
    idempotencyKey,
    unifiedLedgerContext
  );

  const eventObj =
    typeof result.event.toObject === 'function'
      ? result.event.toObject()
      : result.event;
  return {
    ...eventObj,
    isNew: result.isNew,
  };
};

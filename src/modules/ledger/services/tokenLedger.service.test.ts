import { createTokenLedgerEntry } from "./tokenLedger.service";
import { TokenLedgerEntryType, TokenLedgerEntryModel } from "../models/tokenLedgerEntry.model";
import { PropertyModel } from "../../properties/models/propertyModel";
import { TenancyModel } from "../../tenancies/models/tenancyModel";
import { PaymentModel } from "../../payments/models/payment.model";
import { writeAuditEvent } from "../../audit/services/audit.service";

jest.mock("../models/tokenLedgerEntry.model", () => ({
  TokenLedgerEntryType: {
    ACCRUAL: "accrual",
    PURCHASE: "purchase",
    ADJUSTMENT: "adjustment",
    FORFEIT: "forfeit",
    CORRECTION: "correction",
  },
  TokenLedgerEntryModel: {
    create: jest.fn(),
    aggregate: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock("../../properties/models/propertyModel", () => ({
  PropertyModel: { findById: jest.fn() },
}));

jest.mock("../../tenancies/models/tenancyModel", () => ({
  TenancyModel: { findOne: jest.fn() },
}));

jest.mock("../../payments/models/payment.model", () => ({
  PaymentModel: { exists: jest.fn() },
}));

jest.mock("../../audit/services/audit.service", () => ({
  writeAuditEvent: jest.fn(),
}));

function makeQueryChain<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe("tokenLedger.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (PropertyModel.findById as jest.Mock).mockReturnValue(makeQueryChain({ _id: "p1" }));
    (TenancyModel.findOne as jest.Mock).mockReturnValue(makeQueryChain({ status: "ACTIVE" }));
    (PaymentModel.exists as jest.Mock).mockResolvedValue(false);
  });

  it("rejects forfeit entry with non-negative tokens", async () => {
    await expect(
      createTokenLedgerEntry({
        property_id: "507f1f77bcf86cd799439011",
        tenant_id: "507f1f77bcf86cd799439012",
        type: TokenLedgerEntryType.FORFEIT,
        tokens: 5,
        source: "TEPA_VIOLATION",
      })
    ).rejects.toThrow("Forfeit entries must use negative token values");
  });

  it("rejects entry when it would make balance negative", async () => {
    (TokenLedgerEntryModel.aggregate as jest.Mock).mockResolvedValueOnce([{ totalTokens: 3 }]);

    await expect(
      createTokenLedgerEntry({
        property_id: "507f1f77bcf86cd799439011",
        tenant_id: "507f1f77bcf86cd799439012",
        type: TokenLedgerEntryType.ADJUSTMENT,
        tokens: -5,
        source: "MANUAL_ADJUSTMENT",
      })
    ).rejects.toThrow("Negative token balance is not allowed");
  });

  it("writes a TOKEN_CORRECTED audit event with before/after balance and the acting user's role", async () => {
    (TokenLedgerEntryModel.aggregate as jest.Mock)
      .mockResolvedValueOnce([{ totalTokens: 10 }])
      .mockResolvedValueOnce([{ totalTokens: 15 }]);
    (TokenLedgerEntryModel.create as jest.Mock).mockResolvedValue({ _id: "entry1" });

    const result = await createTokenLedgerEntry(
      {
        property_id: "507f1f77bcf86cd799439011",
        tenant_id: "507f1f77bcf86cd799439012",
        type: TokenLedgerEntryType.ADJUSTMENT,
        tokens: 5,
        source: "MANUAL_CORRECTION",
      },
      { userId: "507f1f77bcf86cd799439099", role: "admin" }
    );

    expect(result.balance).toBe(15);
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TOKEN_CORRECTED",
        entityType: "TOKEN_LEDGER_ENTRY",
        entityId: "entry1",
        userRole: "admin",
        source: "user",
        updateType: "manual",
        diff: { before: { balance: 10 }, after: { balance: 15 } },
      })
    );
  });

  it("maps ACCRUAL/PURCHASE entries to TOKEN_ISSUED and marks system-generated entries when no actor is passed", async () => {
    (TokenLedgerEntryModel.aggregate as jest.Mock)
      .mockResolvedValueOnce([{ totalTokens: 0 }])
      .mockResolvedValueOnce([{ totalTokens: 5 }]);
    (TokenLedgerEntryModel.create as jest.Mock).mockResolvedValue({ _id: "entry2" });

    await createTokenLedgerEntry({
      property_id: "507f1f77bcf86cd799439011",
      tenant_id: "507f1f77bcf86cd799439012",
      type: TokenLedgerEntryType.PURCHASE,
      tokens: 5,
      source: "STRIPE_PAYMENT:2026-07",
    });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TOKEN_ISSUED",
        actorUserId: undefined,
        source: "system",
        updateType: "system_generated",
      })
    );
  });
});

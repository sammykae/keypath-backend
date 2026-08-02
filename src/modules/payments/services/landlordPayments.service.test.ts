import mongoose from "mongoose";
import { createLandlordPayment } from "./landlordPayments.service";
import { PaymentModel } from "../models/payment.model";
import { UnitModel } from "../../units/models/unit.model";
import { PropertyModel } from "../../properties/models/propertyModel";
import { createLedgerEntryFromStripePayment } from "../../ledger/services/tokenLedger.service";

jest.mock("../../landlord/services/landlordDashboard.service", () => ({
  resolveLandlordOrgId: jest.fn().mockResolvedValue("507f1f77bcf86cd7994390aa"),
}));

jest.mock("../../ledger/services/tokenLedger.service", () => ({
  createLedgerEntryFromStripePayment: jest.fn().mockResolvedValue(null),
}));

// Audit writes hit Mongo — must be mocked or the test hangs without a DB
jest.mock("../../audit/services/audit.service", () => ({
  writeAuditEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock("../models/payment.model", () => ({
  PaymentModel: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock("../../units/models/unit.model", () => ({
  UnitModel: { findById: jest.fn() },
}));

jest.mock("../../properties/models/propertyModel", () => ({
  PropertyModel: { findById: jest.fn() },
}));

function makeQueryChain<T>(value: T) {
  return {
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe("landlordPayments.service stripe bridge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (PaymentModel.findOne as jest.Mock).mockReturnValue(makeQueryChain(null));
    (UnitModel.findById as jest.Mock).mockReturnValue(makeQueryChain({ propertyId: "507f1f77bcf86cd799439011" }));
    (PropertyModel.findById as jest.Mock).mockReturnValue(
      makeQueryChain({ orgId: new mongoose.Types.ObjectId("507f1f77bcf86cd7994390aa") })
    );
  });

  it("creates Stripe ledger entry when payment is created as PAID", async () => {
    (PaymentModel.create as jest.Mock).mockResolvedValue({
      tenantUserId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439012"),
      unitId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439013"),
      propertyId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
      period: "2026-04",
      amount: 2000,
      status: "PAID",
      dueDate: new Date("2026-04-05"),
      paidAt: new Date("2026-04-02"),
      method: "stripe_card",
      toObject: () => ({
        _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439014"),
        tenantUserId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439012"),
        unitId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439013"),
        propertyId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
        period: "2026-04",
        amount: 2000,
        status: "PAID",
        dueDate: new Date("2026-04-05"),
        paidAt: new Date("2026-04-02"),
        method: "stripe_card",
        createdAt: new Date("2026-04-01"),
        updatedAt: new Date("2026-04-02"),
      }),
    });

    await createLandlordPayment(
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439015"),
      {
        tenantUserId: "507f1f77bcf86cd799439012",
        unitId: "507f1f77bcf86cd799439013",
        propertyId: "507f1f77bcf86cd799439011",
        period: "2026-04",
        amount: 2000,
        status: "PAID",
        method: "stripe_card",
      },
      "507f1f77bcf86cd7994390aa"
    );

    expect(createLedgerEntryFromStripePayment).toHaveBeenCalledTimes(1);
  });
});

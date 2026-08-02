import { Response } from "express";
import { ZodError } from "zod";
import { createCreditEvent, findOrCreateCreditAccount } from "../services/ledgerService";
import {
  CreateCreditEventSchema,
  IssueCreditsSchema,
  OwnershipCreditsQuerySchema,
  UnifiedLedgerQuerySchema,
} from "../dto/ledgerDTO";
import { AppError } from "../../../core/errors/AppError";
import mongoose from "mongoose";
import { getBalance } from "../services/balanceService";
import { AuthenticatedRequest } from "../../auth/types/auth-request";
import {
  resolveOrgAndVerifyAccess,
  ensureTenantInOrg,
  issueCreditsToTenant,
} from "../services/issueCredits.service";
import { getOwnershipCredits } from "../services/ownershipCredits.service";
import {
  listUnifiedEntriesForTenant,
  reconcileUnifiedBalancesForTenant,
} from "../services/unifiedLedger.service";
import { LedgerKind } from "../types/unifiedLedgerTypes";
import { CreateTokenLedgerEntrySchema } from "../dto/ledgerDTO";
import { Membership } from "../../orgs/models/membership.model";
import { PropertyModel } from "../../properties/models/propertyModel";
import { TenancyModel } from "../../tenancies/models/tenancyModel";
import { UnitModel } from "../../units/models/unit.model";
import { createTokenLedgerEntry, listTokenLedgerEntries } from "../services/tokenLedger.service";
import { writeAuditEvent } from "../../audit/services/audit.service";
import { CreditAccountModel } from "../models/creditAccountModel";
import { getPropertyIdFromCreditAccount } from "../services/ledgerAudit.helper";

export const findOrCreateAccountHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.auth?._id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const rawOrgId = req.body?.orgId;
    const rawUnitId = req.body?.unitId;
    // Only pass orgId/unitId if they are valid ObjectIds (ignore placeholder values like "string")
    const orgId =
      typeof rawOrgId === "string" && rawOrgId && mongoose.Types.ObjectId.isValid(rawOrgId)
        ? rawOrgId
        : undefined;
    const unitId =
      typeof rawUnitId === "string" && rawUnitId && mongoose.Types.ObjectId.isValid(rawUnitId)
        ? rawUnitId
        : undefined;
    const account = await findOrCreateCreditAccount({
      tenantUserId: userId.toString(),
      orgId,
      unitId
    });
    const acc = account as {
      _id: mongoose.Types.ObjectId;
      tenantUserId?: mongoose.Types.ObjectId;
      orgId?: mongoose.Types.ObjectId;
      unitId?: mongoose.Types.ObjectId;
    };
    const propertyId = await getPropertyIdFromCreditAccount(acc);
    if (userId && acc._id) {
      await writeAuditEvent({
        actorUserId: userId,
        orgId: acc.orgId,
        action: "CREDIT_ACCOUNT_FIND_OR_CREATE",
        entityType: "LEDGER",
        entityId: acc._id,
        propertyId,
        tenantId: acc.tenantUserId,
        metadata: {
          orgId: acc.orgId?.toString(),
          unitId: acc.unitId?.toString(),
        },
        diff: {
          after: { accountId: acc._id.toString() },
        },
      });
    }
    res.status(200).json({
      accountId: (account as any)._id.toString(),
      tenantUserId: (account as any).tenantUserId?.toString(),
      orgId: (account as any).orgId?.toString() ?? null,
      unitId: (account as any).unitId?.toString() ?? null
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      console.error("Unexpected error in find or create account:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const createCreditEventHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = CreateCreditEventSchema.parse(req.body);
    const event = await createCreditEvent(validatedData);
    const actorId = req.auth?._id;
    if (actorId && event?._id) {
      const account = await CreditAccountModel.findById(validatedData.accountId).lean();
      const propertyId = await getPropertyIdFromCreditAccount(account);
      await writeAuditEvent({
        actorUserId: actorId,
        orgId: account?.orgId,
        action: "CREDIT_EVENT_CREATED",
        entityType: "LEDGER",
        entityId: event._id,
        propertyId,
        tenantId: account?.tenantUserId,
        metadata: {
          accountId: validatedData.accountId,
          type: validatedData.type,
          amount: validatedData.amount,
        },
        diff: {
          after: {
            type: validatedData.type,
            amount: validatedData.amount,
            idempotencyKey: validatedData.idempotencyKey,
          },
        },
      });
    }
    res.status(201).json({
      message: "Credit event created successfully",
      event
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    if (err instanceof ZodError) {
      const message = err.issues.map((e: { message: string }) => e.message).join("; ") || "Validation error";
      res.status(400).json({ error: message });
      return;
    }
    console.error("Unexpected error in create credit event:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
 

export const getAccountBalanceHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      res.status(400).json({ error: "Invalid account ID" });
      return;
    }
    const balance = await getBalance(new mongoose.Types.ObjectId(accountId));

    res.status(200).json({
      accountId,
      balance
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      console.error("Unexpected error in get account balance:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

/** POST /landlord/credits/issue — RBAC: LANDLORD (org-scoped) or ADMIN */
export const issueCreditsHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const role = req.auth.role?.toLowerCase();
    if (role !== 'landlord' && role !== 'admin') {
      res.status(403).json({ error: "Insufficient permissions: LANDLORD or ADMIN required" });
      return;
    }

    const parsed = IssueCreditsSchema.parse(req.body);
    const orgId = await resolveOrgAndVerifyAccess(req.auth._id as any, {
      orgId: parsed.orgId,
      propertyId: parsed.propertyId,
    });
    // Require active tenancy for LANDLORD; ADMIN can issue without it (e.g. testing / manual grants)
    if (role !== 'admin') {
      await ensureTenantInOrg(parsed.tenantUserId, orgId, {
        unitId: parsed.unitId,
        propertyId: parsed.propertyId,
      });
    }

    const { event, accountId } = await issueCreditsToTenant(
      parsed,
      orgId,
      req.auth._id as any
    );

    res.status(201).json({
      message: "Credits issued successfully",
      event,
      accountId,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else if (err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err.errors });
    } else {
      console.error("Unexpected error in issue credits:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

/** GET /tenant/ownership-credits — cursor pagination, optional type filter */
export const getOwnershipCreditsHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const query = OwnershipCreditsQuerySchema.parse({
      cursor: req.query.cursor,
      limit: req.query.limit,
      type: req.query.type,
    });
    const result = await getOwnershipCredits(req.auth._id as any, query);
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else if (err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err.errors });
    } else {
      console.error("Unexpected error in get ownership credits:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

/** GET /api/ledger/unified/entries — cursor page of unified REWARD/OWNERSHIP lines for tenant. */
export const listUnifiedLedgerEntriesHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const query = UnifiedLedgerQuerySchema.parse({
      ledgerKind: req.query.ledgerKind,
      cursor: req.query.cursor,
      limit: req.query.limit,
    });
    const ledgerKind = query.ledgerKind ? (query.ledgerKind as LedgerKind) : undefined;
    const result = await listUnifiedEntriesForTenant(req.auth._id as mongoose.Types.ObjectId, {
      ledgerKind,
      limit: query.limit,
      cursor: query.cursor,
    });
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    if (err instanceof ZodError) {
      const message =
        err.issues.map((e: { message: string }) => e.message).join("; ") || "Validation error";
      res.status(400).json({ error: message });
      return;
    }
    console.error("Unexpected error in list unified ledger entries:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/** GET /api/ledger/unified/reconcile — REWARD total vs credit balances, OWNERSHIP by property. */
export const reconcileUnifiedLedgerHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.auth?._id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const result = await reconcileUnifiedBalancesForTenant(req.auth._id as mongoose.Types.ObjectId);
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      console.error("Unexpected error in reconcile unified ledger:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const createTokenLedgerEntryHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = CreateTokenLedgerEntrySchema.parse(req.body);
    const result = await createTokenLedgerEntry(body, { userId: req.auth?._id, role: req.auth?.role });
    res.status(201).json({
      message: "Ledger entry created",
      entry: result.entry,
      balance: result.balance,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    if (err instanceof ZodError) {
      const message = err.issues.map((e: { message: string }) => e.message).join("; ") || "Validation error";
      res.status(400).json({ error: message });
      return;
    }
    console.error("Unexpected error in create token ledger entry:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Previously had no ownership check at all — any authenticated user (including
 * a different tenant) could read any tenant's full TEPA token ledger just by
 * changing the URL param. Tenant callers may only view their own; landlord
 * callers only tenants with a tenancy in their org; admin unrestricted.
 */
export const getTenantLedgerHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenant_id } = req.params;
    if (!req.auth?._id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const role = req.auth.role?.toLowerCase();

    if (role === "tenant") {
      if (tenant_id !== req.auth._id.toString()) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } else if (role !== "admin") {
      const membership = await Membership.findOne({
        userId: req.auth._id,
        status: "active",
        roleInOrg: { $in: ["OWNER", "ADMIN"] },
      }).lean();
      if (!membership) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const tenancies = await TenancyModel.find({ tenantUserId: tenant_id }, "unitId").lean();
      const unitIds = tenancies.map((t: any) => t.unitId);
      const units = await UnitModel.find({ _id: { $in: unitIds } }, "propertyId").lean();
      const properties = await PropertyModel.find(
        { _id: { $in: units.map((u: any) => u.propertyId) }, orgId: (membership as any).orgId },
        "_id"
      ).lean();
      if (properties.length === 0) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const data = await listTokenLedgerEntries({ tenantId: tenant_id });
    res.status(200).json({
      tenant_id,
      balance: data.balance,
      entries: data.entries,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error("Unexpected error in get tenant ledger:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Previously had no org-ownership check at all — any authenticated user could
 * read any property's full token ledger. Landlord callers only their own org's
 * properties; tenants are never allowed (this would leak every tenant's data
 * on the property, not just their own); admin unrestricted.
 */
export const getPropertyLedgerHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.auth?._id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const role = req.auth.role?.toLowerCase();

    if (role === "tenant") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (role !== "admin") {
      const membership = await Membership.findOne({
        userId: req.auth._id,
        status: "active",
        roleInOrg: { $in: ["OWNER", "ADMIN"] },
      }).lean();
      if (!membership) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const property = await PropertyModel.findOne({ _id: id, orgId: (membership as any).orgId }).lean();
      if (!property) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const data = await listTokenLedgerEntries({ propertyId: id });
    res.status(200).json({
      property_id: id,
      balance: data.balance,
      entries: data.entries,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error("Unexpected error in get property ledger:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

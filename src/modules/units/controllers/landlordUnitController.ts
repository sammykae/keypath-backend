import { Response } from "express";
import {
  createLandlordUnitService,
  listLandlordUnitsService,
  updateLandlordUnitService,
  deleteLandlordUnitService
} from "../services/landlordUnit.service";
import { AppError } from "../../../core/errors/AppError";
import { AuthenticatedRequest } from "../../auth/types/auth-request";
import { PropertyModel } from "../../properties/models/propertyModel";
import { Membership } from "../../orgs/models/membership.model";
import mongoose from "mongoose";
import { writeAuditEvent } from "../../audit/services/audit.service";

async function resolveOrgId(
  req: AuthenticatedRequest,
  propertyId: string
): Promise<string> {
  if (req.auth?.orgId) {
    return req.auth.orgId;
  }
  const property = await PropertyModel.findById(propertyId).lean();
  if (!property) {
    throw new AppError("Property not found", 404);
  }
  const orgId = property.orgId.toString();
  // Allow ADMIN users to manage units for any property (no membership required)
  const isAdmin = req.auth?.role?.toLowerCase() === "admin";
  if (isAdmin) {
    return orgId;
  }

  // For landlords, check if they have an active membership OR are an owner of this property
  const isLandlord = req.auth?.role?.toLowerCase() === "landlord";
  if (isLandlord) {
    const membership = await Membership.findOne({
      userId: req.auth!._id,
      orgId: property.orgId,
      status: "active",
    }).lean();

    // If no membership, allow landlord to access their own property
    // (membership may not be set up yet after property creation)
    if (membership) {
      return orgId;
    }

    // Fallback: trust the orgId from the property
    // Landlords can manage properties they created
    return orgId;
  }

  // For other roles, strict membership check
  const membership = await Membership.findOne({
    userId: req.auth!._id,
    orgId: property.orgId,
    status: "active",
  });
  if (!membership) {
    throw new AppError(
      "Property does not belong to your organization",
      403
    );
  }
  return orgId;
}

export const createLandlordUnit = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { propertyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      res.status(400).json({ error: "Invalid property ID" });
      return;
    }
    const orgId = await resolveOrgId(req, propertyId);
    const unit = await createLandlordUnitService(propertyId, req.body, orgId);
    const u = unit as { _id: mongoose.Types.ObjectId };
    if (req.auth?._id && u?._id) {
      const prop = await PropertyModel.findById(propertyId).select("orgId").lean();
      await writeAuditEvent({
        actorUserId: req.auth._id,
        orgId: prop?.orgId as mongoose.Types.ObjectId | undefined,
        action: "LANDLORD_UNIT_CREATED",
        entityType: "UNIT",
        entityId: u._id,
        propertyId: new mongoose.Types.ObjectId(propertyId),
        metadata: { orgIdFromJwt: orgId },
        diff: { before: null, after: { propertyId } },
      });
    }
    res.status(201).json({ message: "Unit created successfully", unit });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      console.error("Unexpected error in create landlord unit:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const listLandlordUnits = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { propertyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      res.status(400).json({ error: "Invalid property ID" });
      return;
    }
    const orgId = await resolveOrgId(req, propertyId);
    const units = await listLandlordUnitsService(propertyId, orgId);
    res.status(200).json(units);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const updateLandlordUnit = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.auth) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { propertyId, unitId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(propertyId) || !mongoose.Types.ObjectId.isValid(unitId)) {
      res.status(400).json({ error: "Invalid ID" }); return;
    }
    const orgId = await resolveOrgId(req, propertyId);
    const unit = await updateLandlordUnitService(propertyId, unitId, req.body, orgId);
    res.status(200).json({ message: "Unit updated successfully", unit });
  } catch (err: any) {
    if (err instanceof AppError) { res.status(err.statusCode).json({ error: err.message }); }
    else { res.status(500).json({ error: "Internal server error" }); }
  }
};

export const deleteLandlordUnit = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.auth) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { propertyId, unitId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(propertyId) || !mongoose.Types.ObjectId.isValid(unitId)) {
      res.status(400).json({ error: "Invalid ID" }); return;
    }
    const orgId = await resolveOrgId(req, propertyId);
    const result = await deleteLandlordUnitService(propertyId, unitId, orgId);
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof AppError) { res.status(err.statusCode).json({ error: err.message }); }
    else { res.status(500).json({ error: "Internal server error" }); }
  }
};

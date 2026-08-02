import { TenancyModel } from "../models/tenancyModel";
import { UnitModel } from "../../units/models/unit.model";
import { PropertyModel } from "../../properties/models/propertyModel";
import { User } from  "../../auth/models/user.model";
import { TenantModel } from "../../tenant/models/tenants.models";
import { AppError } from "../../../core/errors/AppError";
import { CreateTenancySchema, CreateTenancyDTO } from "../dto/tenancyDTO";
import mongoose from "mongoose";
import { logActivity } from "../../activities/services/activityLogger";
import { dispatchCampaignRewardsSafe } from "../../campaign/services/campaignDispatch.service";
import { upsertUnitEntry, upsertTenantEntry } from "../../search-index/services/search-index.service";

/**
 * Resolve auth User for tenancy: `tenantUserId` is normally the User `_id`.
 * If you pass a Tenant core (BE-201) document id instead, we resolve User by matching email.
 */
async function resolveTenantAuthUser(tenantUserId: string): Promise<{
  userId: mongoose.Types.ObjectId;
  user: { role: string };
}> {
  if (!mongoose.Types.ObjectId.isValid(tenantUserId)) {
    throw new AppError("Invalid tenant user ID", 400);
  }

  const oid = new mongoose.Types.ObjectId(tenantUserId);

  let tenantUser = await User.findById(oid).lean();
  if (tenantUser) {
    if (tenantUser.role !== "TENANT") {
      throw new AppError("User is not a tenant", 400);
    }
    return { userId: oid, user: tenantUser as { role: string } };
  }

  const tenantCore = await TenantModel.findById(oid).lean();
  if (tenantCore?.email) {
    const byEmail = await User.findOne({
      email: String(tenantCore.email).toLowerCase().trim(),
    }).lean();
    if (byEmail) {
      if (byEmail.role !== "TENANT") {
        throw new AppError("User is not a tenant", 400);
      }
      return {
        userId: byEmail._id as mongoose.Types.ObjectId,
        user: byEmail as { role: string },
      };
    }
    throw new AppError(
      "No login user for this tenant yet. Use the tenant's User id from /api/auth/me after signup, or register the tenant email first.",
      404
    );
  }

  throw new AppError("Tenant user not found", 404);
}

export const createTenancy = async (data: CreateTenancyDTO) => {
  const parsedData = CreateTenancySchema.parse(data);

  const { userId: resolvedTenantUserId } = await resolveTenantAuthUser(parsedData.tenantUserId);

  // Validate unit exists
  if (!mongoose.Types.ObjectId.isValid(parsedData.unitId)) {
    throw new AppError("Invalid unit ID", 400);
  }

  const unit = await UnitModel.findById(parsedData.unitId).lean();
  if (!unit) {
    throw new AppError("Unit not found", 404);
  }

  // Check for existing active tenancy for this unit
  const existingActiveTenancy = await TenancyModel.findOne({
    unitId: parsedData.unitId,
    status: 'ACTIVE'
  });

  if (existingActiveTenancy) {
    throw new AppError(
      "Unit already has an active tenancy",
      409
    );
  }

  // Create tenancy (always link to auth User id)
  const newTenancy = new TenancyModel({
    ...parsedData,
    tenantUserId: resolvedTenantUserId,
    status: 'ACTIVE'
  });

  await newTenancy.save();

  // Update unit status to OCCUPIED and set denormalized tenantId for search (BE-502)
  const tenantCore = await TenantModel.findOne({ email: (await User.findById(resolvedTenantUserId).lean())?.email }).lean();
  await UnitModel.findByIdAndUpdate(parsedData.unitId, {
    status: 'OCCUPIED',
    ...(tenantCore ? { tenantId: tenantCore._id } : {})
  });

  if (tenantCore) {
    await TenantModel.findByIdAndUpdate(tenantCore._id, {
      $set: { unitId: unit._id, propertyId: unit.propertyId }
    });
  }

  // Get orgId from unit's property for activity logging
  const property = await PropertyModel.findById(unit.propertyId).lean();
  const orgId = property?.orgId?.toString();
  if (!orgId) {
    throw new AppError("Property or organization not found for activity logging", 500);
  }

  // Re-index the unit in SearchIndex now that it has a tenant assigned (BE-501)
  if (tenantCore) {
    const updatedUnit = await UnitModel.findById(parsedData.unitId).lean();
    if (updatedUnit) upsertUnitEntry(updatedUnit).catch(() => {});
    upsertTenantEntry(tenantCore).catch(() => {});
  }

  // Log activity
  await logActivity({
    orgId,
    entityType: 'Tenancy',
    entityId: newTenancy._id,
    actorId: resolvedTenantUserId,
    action: 'TENANCY_CREATED',
    meta: {
      propertyId: unit.propertyId.toString(),
      tenantId: parsedData.tenantUserId.toString(),
      unitId: parsedData.unitId,
      leaseStart: parsedData.leaseStart.toISOString(),
      leaseEnd: parsedData.leaseEnd.toISOString(),
      rentAmount: parsedData.rentAmount
    }
  });

  void dispatchCampaignRewardsSafe({
    orgId,
    triggerEvent: 'TENANCY_CREATED',
    tenantUserId: parsedData.tenantUserId,
    unitId: parsedData.unitId,
    propertyId: unit.propertyId.toString(),
    correlationId: newTenancy._id.toString(),
  });

  return newTenancy.toObject();
};

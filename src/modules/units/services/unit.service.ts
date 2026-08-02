import { UnitModel } from "../models/unit.model";
import { PropertyModel } from "../../properties/models/propertyModel";
import { AppError } from "../../../core/errors/AppError";
import { UnitCreateSchema, UnitCreateDTO } from "../dto/unitDTO";
import mongoose from "mongoose";
import { writeAuditEvent } from "../../audit/services/audit.service";

export const createUnit = async (data: UnitCreateDTO) => {
  const parsedData = UnitCreateSchema.parse(data);

  // Check for duplicate unitNumber within a property
  const existingUnit = await UnitModel.findOne({
    propertyId: parsedData.propertyId,
    unitNumber: parsedData.unitNumber,
  });

  if (existingUnit) {
    throw new AppError(
      "Unit with this unit number already exists for this property",
      409
    );
  }

  const newUnit = new UnitModel(parsedData);
  await newUnit.save();

  const u = newUnit.toObject();
  const prop = await PropertyModel.findById(parsedData.propertyId).select("orgId").lean();
  await writeAuditEvent({
    orgId: prop?.orgId as mongoose.Types.ObjectId | undefined,
    action: "UNIT_CREATED",
    entityType: "UNIT",
    entityId: newUnit._id,
    propertyId: new mongoose.Types.ObjectId(parsedData.propertyId),
    metadata: { unitNumber: parsedData.unitNumber },
    diff: { before: null, after: { unitNumber: parsedData.unitNumber } },
  });

  return u;
};

export const findUnitById = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return UnitModel.findById(id).lean();
};

export const updateUnit = async (id: string, data: Partial<UnitCreateDTO>) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const prev = await UnitModel.findById(id).lean();
  const updatedUnit = await UnitModel.findByIdAndUpdate(id, data, {
    new: true,
  }).lean();

  if (updatedUnit?.propertyId) {
    const prop = await PropertyModel.findById(updatedUnit.propertyId).select("orgId").lean();
    await writeAuditEvent({
      orgId: prop?.orgId as mongoose.Types.ObjectId | undefined,
      action: "UNIT_UPDATED",
      entityType: "UNIT",
      entityId: updatedUnit._id as mongoose.Types.ObjectId,
      propertyId: new mongoose.Types.ObjectId(updatedUnit.propertyId),
      diff: {
        before: prev ? { keys: Object.keys(data || {}) } : null,
        after: { keys: Object.keys(data || {}) },
      },
    });
  }

  return updatedUnit || null;
};

export const deleteUnit = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const deletedUnit = await UnitModel.findByIdAndDelete(id).lean();
  if (deletedUnit?.propertyId) {
    const prop = await PropertyModel.findById(deletedUnit.propertyId).select("orgId").lean();
    await writeAuditEvent({
      orgId: prop?.orgId as mongoose.Types.ObjectId | undefined,
      action: "UNIT_DELETED",
      entityType: "UNIT",
      entityId: deletedUnit._id as mongoose.Types.ObjectId,
      propertyId: new mongoose.Types.ObjectId(deletedUnit.propertyId),
      diff: {
        before: { unitNumber: (deletedUnit as { unitNumber?: string }).unitNumber },
        after: null,
      },
    });
  }
  return deletedUnit || null;
};

export const listUnitsByProperty = async (
  propertyId: string,
  filters?: {
    status?: string;
    minRent?: number;
    maxRent?: number;
    bedrooms?: number;
  }
) => {
  const query: any = { propertyId };

  if (filters?.status) query.status = filters.status;

  if (filters?.minRent || filters?.maxRent) {
    query.rent = {};
    if (filters.minRent) query.rent.$gte = Number(filters.minRent);
    if (filters.maxRent) query.rent.$lte = Number(filters.maxRent);
  }

  if (filters?.bedrooms) query.bedrooms = Number(filters.bedrooms);

  return UnitModel.find(query).lean();
};

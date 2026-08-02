import { UnitModel } from "../models/unit.model";
import { PropertyModel } from "../../properties/models/propertyModel";
import { TenancyModel } from "../../tenancies/models/tenancyModel";
import { AppError } from "../../../core/errors/AppError";
import { UnitCreateSchema, UnitCreateDTO } from "../dto/unitDTO";
import mongoose from "mongoose";

/**
 * Verifies that a property belongs to the specified organization
 */
async function verifyPropertyOrgAccess(
  propertyId: string,
  orgId: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    throw new AppError("Invalid property ID", 400);
  }

  const property = await PropertyModel.findById(propertyId).lean();
  if (!property) {
    throw new AppError("Property not found", 404);
  }

  if (property.orgId.toString() !== orgId) {
    throw new AppError(
      "Property does not belong to your organization",
      403
    );
  }
}

export const createLandlordUnitService = async (
  propertyId: string,
  data: Partial<UnitCreateDTO>,
  orgId: string
) => {
  // Verify property belongs to org
  await verifyPropertyOrgAccess(propertyId, orgId);

  // Validate and prepare unit data
  const unitData: UnitCreateDTO = {
    ...data,
    propertyId,
  } as UnitCreateDTO;

  const parsedData = UnitCreateSchema.parse(unitData);

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

  return newUnit.toObject();
};

export const listLandlordUnitsService = async (
  propertyId: string,
  orgId: string
) => {
  await verifyPropertyOrgAccess(propertyId, orgId);
  return UnitModel.find({ propertyId }).lean();
};

export const updateLandlordUnitService = async (
  propertyId: string,
  unitId: string,
  data: Partial<UnitCreateDTO>,
  orgId: string
) => {
  await verifyPropertyOrgAccess(propertyId, orgId);

  if (!mongoose.Types.ObjectId.isValid(unitId)) {
    throw new AppError("Invalid unit ID", 400);
  }

  const unit = await UnitModel.findOne({ _id: unitId, propertyId }).lean();
  if (!unit) throw new AppError("Unit not found", 404);

  if (data.unitNumber && data.unitNumber !== unit.unitNumber) {
    const conflict = await UnitModel.findOne({ propertyId, unitNumber: data.unitNumber, _id: { $ne: unitId } }).lean();
    if (conflict) throw new AppError("Unit with this number already exists for this property", 409);
  }

  const allowed = ['unitNumber', 'bedrooms', 'bathrooms', 'rent', 'squareFootage', 'status', 'label', 'marketRent', 'scheduledRent'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in data && (data as any)[key] !== undefined) {
      updates[key] = (data as any)[key];
    }
  }

  const updated = await UnitModel.findByIdAndUpdate(unitId, { $set: updates }, { new: true }).lean();
  return updated;
};

export const deleteLandlordUnitService = async (
  propertyId: string,
  unitId: string,
  orgId: string
) => {
  await verifyPropertyOrgAccess(propertyId, orgId);

  if (!mongoose.Types.ObjectId.isValid(unitId)) {
    throw new AppError("Invalid unit ID", 400);
  }

  const unit = await UnitModel.findOne({ _id: unitId, propertyId }).lean();
  if (!unit) throw new AppError("Unit not found", 404);

  // Block deletion if unit has an active tenancy
  const activeTenancy = await TenancyModel.findOne({ unitId, status: 'ACTIVE' }).lean();
  if (activeTenancy) throw new AppError("Cannot delete a unit with an active tenant", 409);

  await UnitModel.findByIdAndDelete(unitId);
  return { deleted: true, unitId };
};

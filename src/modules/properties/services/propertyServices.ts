import mongoose from 'mongoose';
import { PropertyModel } from '../models/propertyModel'
import { PropertyCreateSchema, PropertyCreateDTO, UpdatePropertySchema, UpdatePropertyDTO } from '../dto/propertyDTO';
import { AppError } from '../../../core/errors/AppError';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User } from '../../auth/models/user.model';

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const createProperty = async (data: PropertyCreateDTO) => {
  const parsedData = PropertyCreateSchema.parse(data);

  const duplicate = await PropertyModel.findOne({
    'address.line1': parsedData.address.line1,
    'address.city': parsedData.address.city,
    'address.state': parsedData.address.state,
    'address.postalCode': parsedData.address.postalCode,
  }).lean().exec();

  if (duplicate) {
    throw new AppError('A property with this address already exists', 409);
  }

  if (!parsedData.orgId) {
    throw new AppError('Ownership (orgId) must be defined', 400);
  }

  // Auto-generate unique slug if not provided (avoids E11000 duplicate key on slug: null)
  const slug =
    parsedData.slug?.trim() ||
    `${slugify(parsedData.name)}-${Date.now().toString(36)}`;

  const payload = { ...parsedData, slug };

  const newProperty = new PropertyModel(payload);
  await newProperty.save();

  return newProperty.toObject();
};

export const allProperties = async () => {
  return await PropertyModel.find().lean().exec();
};

export const getPropertyTree = async (id: string) => {
  const property = await PropertyModel.findById(id).lean().exec();
  if (!property) return null;

  const units = await UnitModel.find({ propertyId: property._id }).lean().exec();

  const unitIds = units.map((u) => u._id);
  const tenancies = await TenancyModel.find({
    unitId: { $in: unitIds },
    status: 'ACTIVE',
  }).lean().exec();

  const tenantUserIds = tenancies.map((t) => t.tenantUserId);
  const tenantUsers = await User.find({ _id: { $in: tenantUserIds } })
    .select('_id email profile phone')
    .lean()
    .exec();

  const userMap = new Map(tenantUsers.map((u) => [String(u._id), u]));
  const tenancyByUnit = new Map(tenancies.map((t) => [String(t.unitId), t]));

  const unitsWithTenants = units.map((unit) => {
    const tenancy = tenancyByUnit.get(String(unit._id)) ?? null;
    const tenant = tenancy ? (userMap.get(String(tenancy.tenantUserId)) ?? null) : null;

    return {
      id: String(unit._id),
      unitNumber: unit.unitNumber,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      rent: unit.rent,
      status: unit.status,
      squareFootage: unit.squareFootage ?? null,
      tenant: tenant
        ? {
            id: String(tenant._id),
            email: tenant.email,
            firstName: (tenant as any).profile?.firstName ?? null,
            lastName: (tenant as any).profile?.lastName ?? null,
            phone: (tenant as any).phone ?? null,
            leaseStart: tenancy!.leaseStart,
            leaseEnd: tenancy!.leaseEnd,
            rentAmount: tenancy!.rentAmount,
          }
        : null,
    };
  });

  return {
    id: String(property._id),
    ownerEntityId: String(property.orgId),
    name: property.name,
    slug: property.slug ?? null,
    address: property.address,
    type: property.type,
    status: property.status,
    participationModel: property.participationModel,
    activationStatus: property.activationStatus,
    tokenizedPct: property.tokenizedPct,
    externalIds: property.externalIds ?? null,
    tokenConfig: property.tokenConfig ?? null,
    integrationStatus: property.integrationStatus,
    totalUnits: units.length,
    units: unitsWithTenants,
    createdAt: property.createdAt,
    updatedAt: property.updatedAt,
  };
};

export const propertyById = async (id: string) => {
  return await PropertyModel.findById(id).lean().exec();
};

export const updateProperty = async (id: string, data: UpdatePropertyDTO) => {
  const parsedData = UpdatePropertySchema.parse(data);

  const updatedProperty = await PropertyModel.findByIdAndUpdate(id, { $set: parsedData }, { new: true });
  if (!updatedProperty) {
    throw new AppError('Property not found', 404);
  }

  return updatedProperty.toObject();
};

export const deleteProperty = async (id: string) => {
  const deleted = await PropertyModel.findByIdAndDelete(id);
  if (!deleted) throw new AppError('Property not found', 404);

  return deleted.toObject();
};

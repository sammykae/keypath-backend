import mongoose from 'mongoose';
import { TokenizationConfigModel } from '../models/tokenizationConfigModel';
import { CreateTokenizationConfigDTO, UpdateTokenizationConfigDTO } from '../dto/tokenizationConfigDTO';
import { AppError } from '../../../core/errors/AppError';
import { logTokenizationActivity } from '../../activities/services/activityLogger';
import { PropertyModel } from '../../properties/models/propertyModel';

/**
 * Create a new tokenization config
 */
export const createTokenizationConfig = async (
  data: CreateTokenizationConfigDTO,
  orgId: string,
  actorId: string
) => {
  // Verify property exists and belongs to org
  const property = await PropertyModel.findOne({
    _id: new mongoose.Types.ObjectId(data.propertyId),
    orgId: new mongoose.Types.ObjectId(orgId)
  });

  if (!property) {
    throw new AppError('Property not found or access denied', 404);
  }

  // Check if config already exists
  const existingConfig = await TokenizationConfigModel.findOne({
    propertyId: new mongoose.Types.ObjectId(data.propertyId)
  });

  if (existingConfig) {
    throw new AppError('Tokenization config already exists for this property', 409);
  }

  const newConfig = new TokenizationConfigModel({
    ...data,
    propertyId: new mongoose.Types.ObjectId(data.propertyId)
  });

  await newConfig.save();

  // Log activity
  await logTokenizationActivity(
    orgId,
    data.propertyId,
    actorId,
    'TOKENIZATION_CONFIG_CREATED',
    {
      entity: data.entity,
      equityPct: data.equityPct,
      accrualRate: data.accrualRate,
      network: data.network
    }
  ).catch(err => console.error('Failed to log tokenization config creation:', err));

  return newConfig.toObject();
};

/**
 * Update an existing tokenization config
 */
export const updateTokenizationConfig = async (
  propertyId: string,
  data: UpdateTokenizationConfigDTO,
  orgId: string,
  actorId: string
) => {
  // Verify property exists and belongs to org
  const property = await PropertyModel.findOne({
    _id: new mongoose.Types.ObjectId(propertyId),
    orgId: new mongoose.Types.ObjectId(orgId)
  });

  if (!property) {
    throw new AppError('Property not found or access denied', 404);
  }

  const existingConfig = await TokenizationConfigModel.findOne({
    propertyId: new mongoose.Types.ObjectId(propertyId)
  });

  if (!existingConfig) {
    throw new AppError('Tokenization config not found', 404);
  }

  const oldData = existingConfig.toObject();

  // Update config
  const updatedConfig = await TokenizationConfigModel.findOneAndUpdate(
    { propertyId: new mongoose.Types.ObjectId(propertyId) },
    { $set: data },
    { new: true }
  );

  if (!updatedConfig) {
    throw new AppError('Failed to update tokenization config', 500);
  }

  // Track changes
  const changes: Record<string, any> = {};
  Object.keys(data).forEach(key => {
    if (data[key as keyof UpdateTokenizationConfigDTO] !== undefined) {
      changes[key] = {
        old: oldData[key as keyof typeof oldData],
        new: data[key as keyof UpdateTokenizationConfigDTO]
      };
    }
  });

  // Log activity
  await logTokenizationActivity(
    orgId,
    propertyId,
    actorId,
    'TOKENIZATION_CONFIG_UPDATED',
    changes
  ).catch(err => console.error('Failed to log tokenization config update:', err));

  return updatedConfig.toObject();
};

/**
 * Get tokenization config for a property
 */
export const getTokenizationConfig = async (propertyId: string, orgId: string) => {
  // Verify property exists and belongs to org
  const property = await PropertyModel.findOne({
    _id: new mongoose.Types.ObjectId(propertyId),
    orgId: new mongoose.Types.ObjectId(orgId)
  });

  if (!property) {
    throw new AppError('Property not found or access denied', 404);
  }

  const config = await TokenizationConfigModel.findOne({
    propertyId: new mongoose.Types.ObjectId(propertyId)
  });

  return config ? config.toObject() : null;
};

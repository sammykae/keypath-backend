import mongoose from 'mongoose';
import { ActivityModel } from '../models/activityModel';
import { AppError } from '../../../core/errors/AppError';
import { PropertyModel } from '../../properties/models/propertyModel';

/**
 * Get activities for a specific property
 * Returns reverse-chronological list capped by limit
 */
export const getPropertyActivities = async (
  propertyId: string,
  orgId: string,
  limit: number = 50
): Promise<any[]> => {
  // Verify property exists and belongs to org
  const property = await PropertyModel.findOne({
    _id: new mongoose.Types.ObjectId(propertyId),
    orgId: new mongoose.Types.ObjectId(orgId)
  });

  if (!property) {
    throw new AppError('Property not found or access denied', 404);
  }

  // Fetch activities for this property (entity.type = 'property' and entity.id = propertyId)
  // Also include tenant activities that reference this property in meta
  const propertyIdObj = new mongoose.Types.ObjectId(propertyId);
  const activities = await ActivityModel.find({
    $or: [
      {
        orgId: new mongoose.Types.ObjectId(orgId),
        'entity.type': 'property',
        'entity.id': propertyIdObj
      },
      {
        orgId: new mongoose.Types.ObjectId(orgId),
        'entity.type': 'tenant',
        $or: [
          { 'meta.propertyId': propertyId },
          { 'meta.propertyId': propertyIdObj.toString() }
        ]
      }
    ]
  })
    .sort({ createdAt: -1 }) // Reverse-chronological
    .limit(limit)
    .lean();

  return activities.map(activity => ({
    _id: activity._id.toString(),
    orgId: activity.orgId.toString(),
    entity: {
      type: activity.entity.type,
      id: activity.entity.id.toString()
    },
    actorId: activity.actorId.toString(),
    action: activity.action,
    meta: activity.meta,
    createdAt: activity.createdAt
  }));
};

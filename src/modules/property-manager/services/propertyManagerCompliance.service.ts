import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { hasPMAccess } from './propertyManager.service';
import { PropertyManagerAssignmentModel } from '../models/propertyManagerAssignment.model';
import { listComplianceForProperty } from '../../compliance/services/complianceDocument.service';

/** Read-only Compliance Center view for a property this PM has VIEW_COMPLIANCE_STATUS on. Closes a previously-dead permission flag — nothing enforced it. */
export async function listComplianceForPM(
  propertyManagerUserId: mongoose.Types.ObjectId,
  propertyId: string
) {
  const allowed = await hasPMAccess(propertyManagerUserId, propertyId, 'VIEW_COMPLIANCE_STATUS');
  if (!allowed) throw new AppError('Missing VIEW_COMPLIANCE_STATUS permission on this property', 403);

  const assignment = await PropertyManagerAssignmentModel.findOne({
    propertyManagerUserId,
    propertyId: new mongoose.Types.ObjectId(propertyId),
    status: 'ACTIVE',
  }).lean();
  const orgId = (assignment as any).orgId.toString();

  return listComplianceForProperty(orgId, propertyId);
}

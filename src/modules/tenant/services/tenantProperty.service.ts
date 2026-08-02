import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { Organization } from '../../orgs/models/organization.model';
import { AppError } from '../../../core/errors/AppError';
import mongoose from 'mongoose';

export type LeaseStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';

function computeLeaseStatus(leaseEnd: Date, dbStatus: string): LeaseStatus {
  if (dbStatus === 'ENDED' || dbStatus === 'TERMINATED') return 'EXPIRED';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(leaseEnd);
  end.setHours(0, 0, 0, 0);
  if (end < today) return 'EXPIRED';
  const sixtyDays = new Date(today);
  sixtyDays.setDate(sixtyDays.getDate() + 60);
  if (end <= sixtyDays) return 'EXPIRING_SOON';
  return 'ACTIVE';
}

export interface TenantPropertyResponse {
  tenancy: {
    id: string;
    leaseStart: string;
    leaseEnd: string;
    rentAmount: number;
    leaseStatus: LeaseStatus;
    daysUntilExpiry: number | null;
  } | null;
  property: {
    name: string;
    address: string;
    landlordOrgName: string;
    unitNumber: string;
    bedrooms: number;
    bathrooms: number;
    rent: number;
    unitStatus: 'VACANT' | 'OCCUPIED' | 'TURN' | 'OFFLINE';
  } | null;
  support: Record<string, string>;
  disclaimers: Record<string, string>;
}

export const getTenantProperty = async (tenantUserId: string): Promise<TenantPropertyResponse> => {
  if (!mongoose.Types.ObjectId.isValid(tenantUserId)) {
    throw new AppError('Invalid tenant user ID', 400);
  }

  const support = { email: 'support@keypath.ai', phone: '1-800-KEYPATH' };
  const disclaimers = { general: 'Contact your landlord for lease-specific questions.' };
  const empty: TenantPropertyResponse = { tenancy: null, property: null, support, disclaimers };

  // Find most recent tenancy (active first, then ended)
  const tenancy = await TenancyModel.findOne({
    tenantUserId: new mongoose.Types.ObjectId(tenantUserId)
  })
    .sort({ leaseEnd: -1 })
    .lean();

  if (!tenancy) return empty;

  const unit = await UnitModel.findById(tenancy.unitId).lean();
  if (!unit) return empty;

  const property = await PropertyModel.findById(unit.propertyId).lean();
  if (!property) return empty;

  let landlordOrgName = '';
  if (property.orgId) {
    const org = await Organization.findById(property.orgId).lean();
    if (org) landlordOrgName = org.name || '';
  }

  const address =
    typeof property.address === 'object' && property.address
      ? [
          (property.address as any).line1,
          (property.address as any).city,
          (property.address as any).state,
          (property.address as any).postalCode,
        ]
          .filter(Boolean)
          .join(', ')
      : '';

  const leaseStatus = computeLeaseStatus(tenancy.leaseEnd, tenancy.status);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const leaseEndDay = new Date(tenancy.leaseEnd);
  leaseEndDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((leaseEndDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  return {
    tenancy: {
      id: (tenancy as any)._id.toString(),
      leaseStart: tenancy.leaseStart.toISOString(),
      leaseEnd: tenancy.leaseEnd.toISOString(),
      rentAmount: tenancy.rentAmount,
      leaseStatus,
      daysUntilExpiry: diffDays >= 0 ? diffDays : null
    },
    property: {
      name: property.name,
      address,
      landlordOrgName,
      unitNumber: unit.unitNumber,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      rent: unit.rent,
      unitStatus: unit.status
    },
    support,
    disclaimers
  };
};

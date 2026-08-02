import mongoose from 'mongoose';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { UnitModel } from '../../units/models/unit.model';
import { PropertyModel } from '../../properties/models/propertyModel';

export interface TenantTenancyItem {
  tenancyId: string;
  rentAmount: number;
  leaseStart: string;
  leaseEnd: string;
  leaseStatus: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';
  property: {
    name: string;
    address: string;
    unitNumber: string;
    imageUrl: string | null;
  };
}

function computeLeaseStatus(leaseEnd: Date): 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(leaseEnd);
  end.setHours(0, 0, 0, 0);
  if (end < today) return 'EXPIRED';
  const sixty = new Date(today);
  sixty.setDate(sixty.getDate() + 60);
  return end <= sixty ? 'EXPIRING_SOON' : 'ACTIVE';
}

export async function getTenantTenancies(tenantUserId: string): Promise<{ tenancies: TenantTenancyItem[] }> {
  const tenancies = await TenancyModel.find({
    tenantUserId: new mongoose.Types.ObjectId(tenantUserId),
    status: 'ACTIVE',
  })
    .sort({ createdAt: -1 })
    .lean();

  const items: TenantTenancyItem[] = [];

  for (const t of tenancies) {
    const unit = await UnitModel.findById(t.unitId).lean();
    if (!unit) continue;
    const property = await PropertyModel.findById(unit.propertyId).lean();
    if (!property) continue;

    const address =
      typeof property.address === 'object' && property.address
        ? [(property.address as any).line1, (property.address as any).city, (property.address as any).state]
            .filter(Boolean)
            .join(', ')
        : '';

    items.push({
      tenancyId: (t as any)._id.toString(),
      rentAmount: t.rentAmount,
      leaseStart: t.leaseStart.toISOString(),
      leaseEnd: t.leaseEnd.toISOString(),
      leaseStatus: computeLeaseStatus(t.leaseEnd),
      property: {
        name: property.name,
        address,
        unitNumber: unit.unitNumber,
        imageUrl: (property as any).imageUrl ?? null,
      },
    });
  }

  return { tenancies: items };
}

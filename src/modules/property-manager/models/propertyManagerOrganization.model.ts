import mongoose, { Schema, Document } from 'mongoose';

/**
 * Company profile for a Property Manager who registers independently (no
 * landlord invite) — Path A in Laurel's Property Manager epic spec. `orgId`
 * points at the operational Organization created alongside it, which
 * Property.orgId / PropertyManagerAssignment.orgId are scoped to, exactly
 * like a landlord's org — so a future landlord "claim" only needs to
 * reassign that org's ownership, not migrate any records.
 */
export interface IPropertyManagerOrganization extends Document {
  _id: mongoose.Types.ObjectId;
  primaryContactUserId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  name: string;
  address?: string;
  website?: string;
  propertiesManaged?: number;
  /** Set once the PM confirms authority to administer RPA — required before their first property can be created. */
  authorityConfirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPropertyManagerOrganization>(
  {
    primaryContactUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    website: { type: String, trim: true },
    propertiesManaged: { type: Number, min: 0 },
    authorityConfirmedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'property_manager_organizations' }
);

export const PropertyManagerOrganizationModel = mongoose.model<IPropertyManagerOrganization>(
  'PropertyManagerOrganization',
  schema
);

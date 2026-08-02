import { Schema, model, HydratedDocument, Types } from 'mongoose';

export type OrganizationType =
  | 'LANDLORD_ORG'
  | 'COMMUNITY_ORG'
  | 'INVESTOR_ORG';

export interface IOrgSettings {
  /** Landlord toggle: when false, tenants cannot start a direct chat with the landlord. */
  allowDirectTenantMessaging: boolean;
}

export interface IOrganization {
  type?: OrganizationType;
  name: string;
  primaryContactUserId: Types.ObjectId;
  settings?: IOrgSettings;

  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    type: {
      type: String,
      enum: ['LANDLORD_ORG', 'COMMUNITY_ORG', 'INVESTOR_ORG'],
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    primaryContactUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    settings: {
      allowDirectTenantMessaging: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

/* Indexes */
OrganizationSchema.index({ type: 1 });
OrganizationSchema.index({ primaryContactUserId: 1 });

export type OrganizationDocument = HydratedDocument<IOrganization>;
export const Organization = model<IOrganization>(
  'Organization',
  OrganizationSchema
);
export const OrgModel = Organization;

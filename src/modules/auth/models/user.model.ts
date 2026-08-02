import { Schema, model, HydratedDocument } from 'mongoose';

export type UserRole =
  | 'TENANT'
  | 'LANDLORD'
  | 'COMMUNITY'
  | 'COMMUNITY_STAKEHOLDER'
  | 'INVESTOR'
  | 'ADMIN'
  | 'PROPERTY_MANAGER';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';

export interface OAuthProvider {
  provider: 'google' | 'facebook' | 'linkedin';
  providerUserId: string;
}

// Shared fields present for all roles
export interface CommunityStakeholderProfile {
  organizationName?: string;
  stakeholderType?: string;
  titleRoleAtOrganization?: string;
  cityRegionServed?: string;
}

export interface UserProfile {
  firstName?: string;
  lastName?: string;
  address?: string;
  businessName?: string;
  country?: string;
  avatarUrl?: string;
  communityStakeholder?: CommunityStakeholderProfile;
}

// Role-specific profile sub-documents
export interface TenantProfile {
  phone?: string;
  dateOfBirth?: Date;
  currentAddress?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface LandlordProfile {
  phone?: string;
  companyName?: string;
  businessRegistrationNumber?: string;
  address?: string;
  country?: string;
}

export type CommunityOrgType = 'municipality' | 'school' | 'nonprofit' | 'other';

export interface CommunityProfile {
  orgName?: string;
  orgType?: CommunityOrgType;
  contactFirstName?: string;
  contactLastName?: string;
  contactTitle?: string;
  phone?: string;
  address?: string;
  website?: string;
  country?: string;
}

export interface InvestorProfile {
  phone?: string;
  nationality?: string;
  investmentRange?: '10k-50k' | '50k-250k' | '250k-1m' | '1m+';
  accreditedInvestor?: boolean;
}

export interface IUser {
  email: string;
  phone?: string;
  passwordHash?: string | null;
  oauthProviders?: OAuthProvider[];
  role: UserRole;
  status: UserStatus;
  // Shared profile (name + avatar — every role has these)
  profile?: UserProfile;
  // Role-specific profiles — only the one matching role will be populated
  tenantProfile?: TenantProfile;
  landlordProfile?: LandlordProfile;
  communityProfile?: CommunityProfile;
  investorProfile?: InvestorProfile;
  lastLoginAt?: Date;
  stripeCustomerId?: string;
  emailVerified?: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpiry?: Date | null;
  emailOtp?: string | null;
  emailOtpExpiry?: Date | null;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },

    phone: { type: String, trim: true },

    passwordHash: { type: String, default: null },

    oauthProviders: {
      type: [
        {
          provider: { type: String, enum: ['google', 'facebook', 'linkedin'], required: true },
          providerUserId: { type: String, required: true },
        },
      ],
      default: undefined,
    },

    role: {
      type: String,
      required: true,
      enum: ['TENANT', 'LANDLORD', 'COMMUNITY', 'COMMUNITY_STAKEHOLDER', 'INVESTOR', 'ADMIN', 'PROPERTY_MANAGER'],
    },

    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'PENDING'],
      default: 'PENDING',
    },

    // Shared — used by existing code across all modules
    profile: {
      firstName: String,
      lastName: String,
      address: String,
      businessName: String,
      country: String,
      avatarUrl: String,
      communityStakeholder: {
        organizationName: String,
        stakeholderType: String,
        titleRoleAtOrganization: String,
        cityRegionServed: String,
      },
    },

    // Tenant-specific
    tenantProfile: {
      phone: String,
      dateOfBirth: Date,
      currentAddress: String,
      emergencyContactName: String,
      emergencyContactPhone: String,
    },

    // Landlord-specific
    landlordProfile: {
      phone: String,
      companyName: String,
      businessRegistrationNumber: String,
      address: String,
      country: String,
    },

    // Community Stakeholder-specific
    communityProfile: {
      orgName: String,
      orgType: { type: String, enum: ['municipality', 'school', 'nonprofit', 'other'] },
      contactFirstName: String,
      contactLastName: String,
      contactTitle: String,
      phone: String,
      address: String,
      website: String,
      country: String,
    },

    // Investor-specific
    investorProfile: {
      phone: String,
      nationality: String,
      investmentRange: { type: String, enum: ['10k-50k', '50k-250k', '250k-1m', '1m+'] },
      accreditedInvestor: Boolean,
    },

    lastLoginAt: { type: Date },

    stripeCustomerId: { type: String, index: true, sparse: true },

    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, default: null, index: true, sparse: true },
    emailVerificationExpiry: { type: Date, default: null },
    emailOtp: { type: String, default: null },
    emailOtpExpiry: { type: Date, default: null },
  },
  { timestamps: true }
);

// OAuth uniqueness — only when provider fields exist
UserSchema.index(
  { 'oauthProviders.provider': 1, 'oauthProviders.providerUserId': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'oauthProviders.provider': { $exists: true, $ne: null },
      'oauthProviders.providerUserId': { $exists: true, $ne: null },
    },
  }
);

UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });

export type UserDocument = HydratedDocument<IUser>;
export const User = model<IUser>('User', UserSchema);

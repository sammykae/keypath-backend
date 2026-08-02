import mongoose, { Document, Schema } from "mongoose";

export type TenantStatus = "INVITED" | "ACTIVE" | "INACTIVE" | "REMOVED";

export type TenantSource = "INVITE" | "SELF_SIGNUP";

export interface Tenant extends Document {
  _id: mongoose.Types.ObjectId;
  fullName: string;
  email: string;
  phone?: string;
  source: TenantSource;
  status: TenantStatus;
  invitedByUserId?: mongoose.Types.ObjectId;
  activatedAt?: Date;
  lastOnboardingStep?: string;
  externalPmsId?: string;

  // Self-signup email verification (token is stored as a hash)
  emailVerifiedAt?: Date;
  emailVerificationTokenHash?: string;
  emailVerificationExpiresAt?: Date;

  unitId?: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;

  normalizedName?: string;
  searchKeywords?: string[];

  createdAt: Date;
  updatedAt: Date;
}

// BE-201: Tenant Core Schema (identity independent of property/participation)
const TenantSchema: Schema = new Schema<Tenant>(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true, // Enforces "Email uniqueness supported"
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: { type: String, required: false, trim: true },
    source: {
      type: String,
      enum: ["INVITE", "SELF_SIGNUP"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["INVITED", "ACTIVE", "INACTIVE", "REMOVED"],
      required: true,
      default: "INVITED",
      index: true,
    },

    invitedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: false },
    activatedAt: { type: Date, required: false },
    lastOnboardingStep: { type: String, required: false },
    externalPmsId: { type: String, required: false },

    emailVerifiedAt: { type: Date, required: false },
    emailVerificationTokenHash: { type: String, required: false },
    emailVerificationExpiresAt: { type: Date, required: false },

    unitId: { type: Schema.Types.ObjectId, ref: "Unit", index: true, sparse: true },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", index: true, sparse: true },

    normalizedName: { type: String, index: true },
    searchKeywords: { type: [String], default: [] },
  },
  { timestamps: true }
);

TenantSchema.pre("save", function (next) {
  if (this.isModified("fullName") || !this.normalizedName) {
    const lower = (this.fullName as string).toLowerCase().trim();
    this.normalizedName = lower;
    const parts = lower.split(/\s+/).filter(Boolean);
    this.searchKeywords = [...new Set(parts)];
  }
  next();
});

TenantSchema.index({ normalizedName: "text", searchKeywords: "text" });
// Compound index for landlord tenant list queries
TenantSchema.index({ invitedByUserId: 1, status: 1 });

import { upsertTenantEntry } from '../../search-index/services/search-index.service';
TenantSchema.post('save', function (doc) {
  upsertTenantEntry(doc.toObject()).catch((err) => {
    console.error('[SearchIndex] tenant upsert failed:', err.message);
  });
});

export const TenantModel = mongoose.model<Tenant>("Tenant", TenantSchema);

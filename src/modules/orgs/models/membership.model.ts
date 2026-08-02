import { Schema, model, HydratedDocument, Types } from 'mongoose';

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export type MembershipStatus = 'invited' | 'active' | 'disabled';

/* -------------------------------------------------------------------------- */
/*                                 INTERFACE                                  */
/* -------------------------------------------------------------------------- */

export interface IMembership {
  userId: Types.ObjectId;
  orgId: Types.ObjectId;
  roleInOrg: OrgRole;

  status: MembershipStatus;

  createdAt: Date;
}

/* -------------------------------------------------------------------------- */
/*                                   SCHEMA                                   */
/* -------------------------------------------------------------------------- */

const MembershipSchema = new Schema<IMembership>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    orgId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },

    roleInOrg: {
      type: String,
      enum: ['OWNER', 'ADMIN', 'MEMBER'],
      required: true,
    },

    status: {
      type: String,
      enum: ['invited', 'active', 'disabled'],
      default: 'active',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

/* -------------------------------------------------------------------------- */
/*                                   INDEXES                                  */
/* -------------------------------------------------------------------------- */

MembershipSchema.index({ userId: 1, orgId: 1 }, { unique: true });
MembershipSchema.index({ orgId: 1 });
MembershipSchema.index({ status: 1 });

/* -------------------------------------------------------------------------- */
/*                                   EXPORT                                   */
/* -------------------------------------------------------------------------- */

export type MembershipDocument = HydratedDocument<IMembership>;

export const Membership = model<IMembership>('Membership', MembershipSchema);
export const MembershipModel = Membership;

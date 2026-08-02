import mongoose, { Document, Schema, Types } from 'mongoose';

const stakeholderScopeFields = {
  stakeholderUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  stakeholderType: { type: String, required: true, index: true },
  configKey: { type: String, required: true, index: true },
};

const kpiCardSchema = new Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    value: { type: String, required: true },
    subtitle: { type: String, required: true },
  },
  { _id: false }
);

export interface CommunityStakeholderProfileDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  organizationName?: string | null;
  stakeholderTypeLabel?: string | null;
  titleRoleAtOrganization?: string | null;
  cityRegionServed?: string | null;
  phoneNumber?: string | null;
}

const communityStakeholderProfileSchema = new Schema<CommunityStakeholderProfileDoc>(
  {
    ...stakeholderScopeFields,
    organizationName: { type: String, default: null },
    stakeholderTypeLabel: { type: String, default: null },
    titleRoleAtOrganization: { type: String, default: null },
    cityRegionServed: { type: String, default: null },
    phoneNumber: { type: String, default: null },
  },
  { timestamps: true }
);

communityStakeholderProfileSchema.index({ stakeholderUserId: 1 }, { unique: true });

export interface CommunityProgramDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  kpiCards: Array<{ key: string; title: string; value: string; subtitle: string }>;
  primaryMetrics: string[];
  reportItems: Array<{ title: string; description: string }>;
  briefGenerator?: { title: string; description: string };
}

const communityProgramSchema = new Schema<CommunityProgramDoc>(
  {
    ...stakeholderScopeFields,
    kpiCards: { type: [kpiCardSchema], default: [] },
    primaryMetrics: { type: [String], default: [] },
    reportItems: {
      type: [{ title: String, description: String }],
      default: [],
    },
    briefGenerator: {
      type: { title: String, description: String },
      default: undefined,
    },
  },
  { timestamps: true }
);

export interface HousingProjectDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  name: string;
  location: string;
  developer: string;
  type: string;
  units: string;
  status: string;
  schedule: string;
  complete: string;
  featured?: boolean;
  budget?: {
    budgetedTotal: string;
    spentToDate: string;
    variance: string;
  };
}

const housingProjectSchema = new Schema<HousingProjectDoc>(
  {
    ...stakeholderScopeFields,
    name: { type: String, required: true },
    location: { type: String, required: true },
    developer: { type: String, required: true },
    type: { type: String, required: true },
    units: { type: String, required: true },
    status: { type: String, required: true },
    schedule: { type: String, required: true },
    complete: { type: String, required: true },
    featured: { type: Boolean, default: false },
    budget: {
      budgetedTotal: String,
      spentToDate: String,
      variance: String,
    },
  },
  { timestamps: true }
);

export interface ProjectMetricDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  metricKey: string;
  title: string;
  value: string;
  subtitle: string;
  category?: string;
}

const projectMetricSchema = new Schema<ProjectMetricDoc>(
  {
    ...stakeholderScopeFields,
    metricKey: { type: String, required: true },
    title: { type: String, required: true },
    value: { type: String, required: true },
    subtitle: { type: String, required: true },
    category: { type: String },
  },
  { timestamps: true }
);

projectMetricSchema.index({ stakeholderUserId: 1, metricKey: 1 });

export interface LocalEconomicImpactDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  localPercent: number;
  nonLocalPercent: number;
  spendMetrics: Array<{ label: string; value: string }>;
  vendorMetrics: Array<{ label: string; value: string }>;
}

const localEconomicImpactSchema = new Schema<LocalEconomicImpactDoc>(
  {
    ...stakeholderScopeFields,
    localPercent: { type: Number, default: 0 },
    nonLocalPercent: { type: Number, default: 0 },
    spendMetrics: { type: [{ label: String, value: String }], default: [] },
    vendorMetrics: { type: [{ label: String, value: String }], default: [] },
  },
  { timestamps: true }
);

export interface PublicRevenueImpactDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  kpiCards: Array<{ key: string; title: string; value: string; subtitle: string }>;
  activityBars: Array<{ value: string; widthPercent: number; color?: string }>;
  estimates: {
    programActivityValue: string;
    portfolioImpactValue: string;
    publicBenefitYtd: string;
  };
  bottomMetrics: Array<{ label: string; value: string }>;
}

const publicRevenueImpactSchema = new Schema<PublicRevenueImpactDoc>(
  {
    ...stakeholderScopeFields,
    kpiCards: { type: [kpiCardSchema], default: [] },
    activityBars: {
      type: [{ value: String, widthPercent: Number, color: String }],
      default: [],
    },
    estimates: {
      programActivityValue: String,
      portfolioImpactValue: String,
      publicBenefitYtd: String,
    },
    bottomMetrics: { type: [{ label: String, value: String }], default: [] },
  },
  { timestamps: true }
);

export interface TenantParticipationImpactDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  growthData: Array<{
    year: number;
    tenants: number;
    percentage: number;
    benchmark: number;
  }>;
  economicValueData: Array<{ year: number; value: number; color: string }>;
  cohorts: Array<{ name: string; year: number; accum: string; retention: string }>;
  economicMetrics: {
    aggregateParticipationYoy: string;
    averageAccumulationRange: string;
  };
}

const tenantParticipationImpactSchema = new Schema<TenantParticipationImpactDoc>(
  {
    ...stakeholderScopeFields,
    growthData: {
      type: [{ year: Number, tenants: Number, percentage: Number, benchmark: Number }],
      default: [],
    },
    economicValueData: {
      type: [{ year: Number, value: Number, color: String }],
      default: [],
    },
    cohorts: {
      type: [{ name: String, year: Number, accum: String, retention: String }],
      default: [],
    },
    economicMetrics: {
      aggregateParticipationYoy: String,
      averageAccumulationRange: String,
    },
  },
  { timestamps: true }
);

export interface PublicCommitmentDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  type: string;
  promised: string;
  achieved: string;
  status: string;
  target: string;
}

const publicCommitmentSchema = new Schema<PublicCommitmentDoc>(
  {
    ...stakeholderScopeFields,
    type: { type: String, required: true },
    promised: { type: String, required: true },
    achieved: { type: String, required: true },
    status: { type: String, required: true },
    target: { type: String, required: true },
  },
  { timestamps: true }
);

export interface ComplianceIssueDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  label: string;
  detail: string;
  severity: 'high' | 'low' | 'medium';
  status?: string;
}

const complianceIssueSchema = new Schema<ComplianceIssueDoc>(
  {
    ...stakeholderScopeFields,
    label: { type: String, required: true },
    detail: { type: String, required: true },
    severity: { type: String, enum: ['high', 'low', 'medium'], default: 'low' },
    status: { type: String },
  },
  { timestamps: true }
);

export interface CommunityReportDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  title: string;
  description: string;
  reportType?: string;
}

const communityReportSchema = new Schema<CommunityReportDoc>(
  {
    ...stakeholderScopeFields,
    title: { type: String, required: true },
    description: { type: String, required: true },
    reportType: { type: String },
  },
  { timestamps: true }
);

export interface StakeholderMessageDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  from: string;
  subject: string;
  preview: string;
  sentAt: Date;
  unread: boolean;
}

const stakeholderMessageSchema = new Schema<StakeholderMessageDoc>(
  {
    ...stakeholderScopeFields,
    from: { type: String, required: true },
    subject: { type: String, required: true },
    preview: { type: String, required: true },
    sentAt: { type: Date, required: true },
    unread: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export interface AuditTrailEventDoc extends Document {
  stakeholderUserId: Types.ObjectId;
  stakeholderType: string;
  configKey: string;
  actor: string;
  action: string;
  detail: string;
  occurredAt: Date;
}

const auditTrailEventSchema = new Schema<AuditTrailEventDoc>(
  {
    ...stakeholderScopeFields,
    actor: { type: String, required: true },
    action: { type: String, required: true },
    detail: { type: String, required: true },
    occurredAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export interface CommunityStakeholderTypeConfigDoc extends Document {
  stakeholderType: string;
  configKey: string;
  primaryMetrics: string[];
  sidebarLabels: Record<string, string>;
  terminology: Record<string, string>;
}

const communityStakeholderTypeConfigSchema = new Schema<CommunityStakeholderTypeConfigDoc>(
  {
    stakeholderType: { type: String, required: true, unique: true },
    configKey: { type: String, required: true },
    primaryMetrics: { type: [String], default: [] },
    sidebarLabels: { type: Schema.Types.Mixed, default: {} },
    terminology: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const CommunityStakeholderProfileModel = mongoose.model<CommunityStakeholderProfileDoc>(
  'CommunityStakeholderProfile',
  communityStakeholderProfileSchema
);

export const CommunityProgramModel = mongoose.model<CommunityProgramDoc>(
  'CommunityProgram',
  communityProgramSchema
);

export const HousingProjectModel = mongoose.model<HousingProjectDoc>(
  'CommunityHousingProject',
  housingProjectSchema
);

export const ProjectMetricModel = mongoose.model<ProjectMetricDoc>(
  'CommunityProjectMetric',
  projectMetricSchema
);

export const LocalEconomicImpactModel = mongoose.model<LocalEconomicImpactDoc>(
  'CommunityLocalEconomicImpact',
  localEconomicImpactSchema
);

export const PublicRevenueImpactModel = mongoose.model<PublicRevenueImpactDoc>(
  'CommunityPublicRevenueImpact',
  publicRevenueImpactSchema
);

export const TenantParticipationImpactModel = mongoose.model<TenantParticipationImpactDoc>(
  'CommunityTenantParticipationImpact',
  tenantParticipationImpactSchema
);

export const PublicCommitmentModel = mongoose.model<PublicCommitmentDoc>(
  'CommunityPublicCommitment',
  publicCommitmentSchema
);

export const ComplianceIssueModel = mongoose.model<ComplianceIssueDoc>(
  'CommunityComplianceIssue',
  complianceIssueSchema
);

export const CommunityReportModel = mongoose.model<CommunityReportDoc>(
  'CommunityReport',
  communityReportSchema
);

export const StakeholderMessageModel = mongoose.model<StakeholderMessageDoc>(
  'CommunityStakeholderMessage',
  stakeholderMessageSchema
);

export const AuditTrailEventModel = mongoose.model<AuditTrailEventDoc>(
  'CommunityAuditTrailEvent',
  auditTrailEventSchema
);

export const CommunityStakeholderTypeConfigModel =
  mongoose.model<CommunityStakeholderTypeConfigDoc>(
    'CommunityStakeholderTypeConfig',
    communityStakeholderTypeConfigSchema
  );

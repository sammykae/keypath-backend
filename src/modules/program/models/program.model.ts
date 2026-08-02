import mongoose, { Document, Schema } from 'mongoose';

export type ProjectType =
  | 'BTR'
  | 'SFR'
  | 'WORKFORCE'
  | 'AFFORDABLE'
  | 'LUXURY'
  | 'MIXED_USE';

export type ProjectStatus = 'LEASING' | 'CONSTRUCTION' | 'STABILIZED';
export type ScheduleStatus = 'ON_SCHEDULE' | 'AT_RISK' | 'DELAYED';
export type RiskColor = 'RED' | 'YELLOW' | 'GREEN';
export type ComplianceStatus = 'ON_TRACK' | 'AT_RISK' | 'NON_COMPLIANT';
export type PledgeStatus = 'ON_TRACK' | 'AT_RISK' | 'EXCEEDED';
export type ParticipationStatus = 'ACTIVE' | 'INACTIVE' | 'EXITED';
export type GeographyTag = 'LOCAL_CITY' | 'STATE' | 'NON_LOCAL';
export type VendorCategory =
  | 'CONSTRUCTION'
  | 'MAINTENANCE'
  | 'PROFESSIONAL_SERVICES'
  | 'OTHER';

export interface ProgramProject extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  city: string;
  state: string;
  developer: string;
  projectType: ProjectType;
  unitsPlanned: number;
  unitsDelivered: number;
  status: ProjectStatus;
  scheduleStatus: ScheduleStatus;
  percentComplete: number;
  budgetPlanned: number;
  budgetActual: number;
  plannedDeliveryDate?: Date;
  projectedDeliveryDate?: Date;
  financingStatus: 'STABLE' | 'ISSUE';
  permittingStatus: 'CLEAR' | 'ISSUE';
  jobsSupported: number;
  preDevelopmentAssessedValue?: number;
  postDevelopmentAssessedValue?: number;
  municipalMillageRate?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProgramProjectSchema = new Schema<ProgramProject>(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    developer: { type: String, required: true, trim: true },
    projectType: {
      type: String,
      enum: ['BTR', 'SFR', 'WORKFORCE', 'AFFORDABLE', 'LUXURY', 'MIXED_USE'],
      required: true,
    },
    unitsPlanned: { type: Number, required: true, min: 0 },
    unitsDelivered: { type: Number, required: true, min: 0, default: 0 },
    status: {
      type: String,
      enum: ['LEASING', 'CONSTRUCTION', 'STABILIZED'],
      required: true,
    },
    scheduleStatus: {
      type: String,
      enum: ['ON_SCHEDULE', 'AT_RISK', 'DELAYED'],
      required: true,
      default: 'ON_SCHEDULE',
    },
    percentComplete: { type: Number, required: true, min: 0, max: 100, default: 0 },
    budgetPlanned: { type: Number, required: true, min: 0, default: 0 },
    budgetActual: { type: Number, required: true, min: 0, default: 0 },
    plannedDeliveryDate: { type: Date },
    projectedDeliveryDate: { type: Date },
    financingStatus: { type: String, enum: ['STABLE', 'ISSUE'], default: 'STABLE' },
    permittingStatus: { type: String, enum: ['CLEAR', 'ISSUE'], default: 'CLEAR' },
    jobsSupported: { type: Number, min: 0, default: 0 },
    preDevelopmentAssessedValue: { type: Number, min: 0 },
    postDevelopmentAssessedValue: { type: Number, min: 0 },
    municipalMillageRate: { type: Number, min: 0 },
  },
  { timestamps: true }
);

ProgramProjectSchema.index({ status: 1, scheduleStatus: 1 });
ProgramProjectSchema.index({ city: 1, state: 1 });

export interface ProjectRiskFlag extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  flagType: 'CONSTRUCTION_DELAY' | 'FINANCING_ISSUE' | 'PERMITTING_ISSUE' | 'BUDGET_VARIANCE';
  color: RiskColor;
  reason: string;
  thresholdValue: number;
  observedValue: number;
  raisedAt: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectRiskFlagSchema = new Schema<ProjectRiskFlag>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'ProgramProject', required: true, index: true },
    flagType: {
      type: String,
      enum: ['CONSTRUCTION_DELAY', 'FINANCING_ISSUE', 'PERMITTING_ISSUE', 'BUDGET_VARIANCE'],
      required: true,
    },
    color: { type: String, enum: ['RED', 'YELLOW', 'GREEN'], required: true },
    reason: { type: String, required: true },
    thresholdValue: { type: Number, required: true, min: 0 },
    observedValue: { type: Number, required: true, min: 0 },
    raisedAt: { type: Date, required: true, default: Date.now },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

ProjectRiskFlagSchema.index({ projectId: 1, flagType: 1, raisedAt: -1 });

export interface TepaParticipationLedger extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  entryYear: number;
  participationStatus: ParticipationStatus;
  annualAccumulation: number;
  totalAccumulationValue: number;
  createdAt: Date;
  updatedAt: Date;
}

const TepaParticipationLedgerSchema = new Schema<TepaParticipationLedger>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    entryYear: { type: Number, required: true, min: 2000 },
    participationStatus: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'EXITED'],
      required: true,
      default: 'ACTIVE',
    },
    annualAccumulation: { type: Number, required: true, min: 0, default: 0 },
    totalAccumulationValue: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);

TepaParticipationLedgerSchema.index({ entryYear: 1, participationStatus: 1 });

export interface ProgramComplianceRecord extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  zoningCompliance: boolean;
  housingCovenantsCompliance: boolean;
  reportingComplete: boolean;
  programCompletionMilestonesMet: boolean;
  status: ComplianceStatus;
  nextAuditDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProgramComplianceRecordSchema = new Schema<ProgramComplianceRecord>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'ProgramProject', required: true, unique: true },
    zoningCompliance: { type: Boolean, required: true, default: true },
    housingCovenantsCompliance: { type: Boolean, required: true, default: true },
    reportingComplete: { type: Boolean, required: true, default: true },
    programCompletionMilestonesMet: { type: Boolean, required: true, default: true },
    status: { type: String, enum: ['ON_TRACK', 'AT_RISK', 'NON_COMPLIANT'], required: true },
    nextAuditDate: { type: Date, required: true },
  },
  { timestamps: true }
);

ProgramComplianceRecordSchema.index({ status: 1, nextAuditDate: 1 });

export interface VendorSpendRecord extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  vendorName: string;
  vendorCategory: VendorCategory;
  geographyTag: GeographyTag;
  amount: number;
  taxable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VendorSpendRecordSchema = new Schema<VendorSpendRecord>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'ProgramProject', required: true, index: true },
    vendorName: { type: String, required: true, trim: true },
    vendorCategory: {
      type: String,
      enum: ['CONSTRUCTION', 'MAINTENANCE', 'PROFESSIONAL_SERVICES', 'OTHER'],
      required: true,
    },
    geographyTag: { type: String, enum: ['LOCAL_CITY', 'STATE', 'NON_LOCAL'], required: true },
    amount: { type: Number, required: true, min: 0 },
    taxable: { type: Boolean, required: true, default: true },
  },
  { timestamps: true }
);

VendorSpendRecordSchema.index({ geographyTag: 1, vendorCategory: 1 });
// Index for date-range queries in getEconomicActivityAndTaxProxy
VendorSpendRecordSchema.index({ createdAt: 1 });

export interface ProgramPledgeRecord extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  pledgeType:
    | 'AFFORDABLE_UNITS'
    | 'LOCAL_VENDOR_PERCENT'
    | 'TEPA_PARTICIPATION_PERCENT'
    | 'PROGRAM_COMPLETION_MILESTONES';
  promised: number;
  achieved: number;
  status: PledgeStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ProgramPledgeRecordSchema = new Schema<ProgramPledgeRecord>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'ProgramProject', required: true, index: true },
    pledgeType: {
      type: String,
      enum: [
        'AFFORDABLE_UNITS',
        'LOCAL_VENDOR_PERCENT',
        'TEPA_PARTICIPATION_PERCENT',
        'PROGRAM_COMPLETION_MILESTONES',
      ],
      required: true,
    },
    promised: { type: Number, required: true, min: 0 },
    achieved: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, enum: ['ON_TRACK', 'AT_RISK', 'EXCEEDED'], required: true },
  },
  { timestamps: true }
);

ProgramPledgeRecordSchema.index({ projectId: 1, pledgeType: 1 }, { unique: true });

export const ProgramProjectModel = mongoose.model<ProgramProject>('ProgramProject', ProgramProjectSchema);
export const ProjectRiskFlagModel = mongoose.model<ProjectRiskFlag>('ProjectRiskFlag', ProjectRiskFlagSchema);
export const TepaParticipationLedgerModel = mongoose.model<TepaParticipationLedger>(
  'TepaParticipationLedger',
  TepaParticipationLedgerSchema
);
export const ProgramComplianceRecordModel = mongoose.model<ProgramComplianceRecord>(
  'ProgramComplianceRecord',
  ProgramComplianceRecordSchema
);
export const VendorSpendRecordModel = mongoose.model<VendorSpendRecord>('VendorSpendRecord', VendorSpendRecordSchema);
export const ProgramPledgeRecordModel = mongoose.model<ProgramPledgeRecord>(
  'ProgramPledgeRecord',
  ProgramPledgeRecordSchema
);
import mongoose from 'mongoose';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import {
  ProgramComplianceRecordModel,
  ProgramPledgeRecordModel,
  ProgramProjectModel,
  ProjectRiskFlagModel,
  TepaParticipationLedgerModel,
  VendorSpendRecordModel,
  ScheduleStatus,
  ComplianceStatus,
  RiskColor,
} from '../models/program.model';
import { AppError } from '../../../core/errors/AppError';

const BUDGET_VARIANCE_THRESHOLD_PERCENT = 10;
const DELAY_THRESHOLD_DAYS = 30;

const derivePledgeStatus = (promised: number, achieved: number): 'ON_TRACK' | 'AT_RISK' | 'EXCEEDED' => {
  if (promised <= 0) {
    return achieved > 0 ? 'EXCEEDED' : 'ON_TRACK';
  }

  const ratio = achieved / promised;
  if (ratio >= 1) return 'EXCEEDED';
  if (ratio >= 0.85) return 'ON_TRACK';
  return 'AT_RISK';
};

const deriveComplianceStatus = (
  zoningCompliance: boolean,
  housingCovenantsCompliance: boolean,
  reportingComplete: boolean,
  programCompletionMilestonesMet: boolean
): ComplianceStatus => {
  const allGood =
    zoningCompliance && housingCovenantsCompliance && reportingComplete && programCompletionMilestonesMet;

  if (allGood) {
    return 'ON_TRACK';
  }

  if (!zoningCompliance || !housingCovenantsCompliance) {
    return 'NON_COMPLIANT';
  }

  return 'AT_RISK';
};

export const createProject = async (payload: Record<string, unknown>) => {
  const project = await ProgramProjectModel.create(payload);
  return project.toObject();
};

export const listProjectsWithStatus = async () => {
  const projects = await ProgramProjectModel.find().sort({ createdAt: -1 }).lean();

  return projects.map((project) => ({
    id: project._id.toString(),
    projectName: project.name,
    location: `${project.city}, ${project.state}`,
    developer: project.developer,
    projectType: project.projectType,
    unitsPlanned: project.unitsPlanned,
    unitsDelivered: project.unitsDelivered,
    status: project.status,
    scheduleStatus: project.scheduleStatus,
    percentComplete: project.percentComplete,
  }));
};

export const upsertTepaParticipation = async (payload: Record<string, unknown>) => {
  const tenantId = payload.tenantId as string | undefined;
  if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
    throw new AppError('Valid tenantId is required', 400);
  }
  const entryYear = Number(payload.entryYear);
  if (!Number.isInteger(entryYear) || entryYear < 2000) {
    throw new AppError('Valid entryYear is required', 400);
  }

  const result = await TepaParticipationLedgerModel.findOneAndUpdate(
    { tenantId: new mongoose.Types.ObjectId(tenantId), entryYear },
    { ...payload, tenantId: new mongoose.Types.ObjectId(tenantId), entryYear },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  return result;
};

export const upsertProgramCompliance = async (payload: Record<string, unknown>) => {
  const projectId = payload.projectId as string | undefined;
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    throw new AppError('Valid projectId is required', 400);
  }

  const zoningCompliance =
    payload.zoningCompliance !== undefined ? Boolean(payload.zoningCompliance) : true;
  const housingCovenantsCompliance =
    payload.housingCovenantsCompliance !== undefined ? Boolean(payload.housingCovenantsCompliance) : true;
  const reportingComplete =
    payload.reportingComplete !== undefined ? Boolean(payload.reportingComplete) : true;
  const programCompletionMilestonesMet =
    payload.programCompletionMilestonesMet !== undefined
      ? Boolean(payload.programCompletionMilestonesMet)
      : true;
  const nextAuditDate =
    payload.nextAuditDate !== undefined ? new Date(String(payload.nextAuditDate)) : new Date(Date.now() + 90 * 86400000);
  if (Number.isNaN(nextAuditDate.getTime())) {
    throw new AppError('nextAuditDate must be a valid date', 400);
  }
  const status = deriveComplianceStatus(
    zoningCompliance,
    housingCovenantsCompliance,
    reportingComplete,
    programCompletionMilestonesMet
  );

  const compliance = await ProgramComplianceRecordModel.findOneAndUpdate(
    { projectId: new mongoose.Types.ObjectId(projectId) },
    {
      projectId: new mongoose.Types.ObjectId(projectId),
      zoningCompliance,
      housingCovenantsCompliance,
      reportingComplete,
      programCompletionMilestonesMet,
      nextAuditDate,
      status,
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  return compliance;
};

export const upsertPledge = async (payload: Record<string, unknown>) => {
  const projectId = payload.projectId as string | undefined;
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    throw new AppError('Valid projectId is required', 400);
  }

  const promised = Number(payload.promised ?? 0);
  const achieved = Number(payload.achieved ?? 0);
  const status = derivePledgeStatus(promised, achieved);

  const pledge = await ProgramPledgeRecordModel.findOneAndUpdate(
    {
      projectId: new mongoose.Types.ObjectId(projectId),
      pledgeType: payload.pledgeType,
    },
    {
      ...payload,
      projectId: new mongoose.Types.ObjectId(projectId),
      promised,
      achieved,
      status,
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  return pledge;
};

export const createVendorSpendRecord = async (payload: Record<string, unknown>) => {
  const projectId = payload.projectId as string | undefined;
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    throw new AppError('Valid projectId is required', 400);
  }

  const record = await VendorSpendRecordModel.create({
    ...payload,
    projectId: new mongoose.Types.ObjectId(projectId),
  });
  return record.toObject();
};

export const evaluateProjectRiskFlags = async (projectId: string) => {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new AppError('Invalid projectId', 400);
  }

  const project = await ProgramProjectModel.findById(projectId).lean();
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  await ProjectRiskFlagModel.deleteMany({ projectId: project._id });

  const flagsToCreate: Array<{
    flagType: 'CONSTRUCTION_DELAY' | 'FINANCING_ISSUE' | 'PERMITTING_ISSUE' | 'BUDGET_VARIANCE';
    color: RiskColor;
    reason: string;
    thresholdValue: number;
    observedValue: number;
  }> = [];

  if (project.plannedDeliveryDate && project.projectedDeliveryDate) {
    const delayMs = new Date(project.projectedDeliveryDate).getTime() - new Date(project.plannedDeliveryDate).getTime();
    const delayDays = Math.max(0, Math.floor(delayMs / (24 * 60 * 60 * 1000)));

    if (delayDays > DELAY_THRESHOLD_DAYS) {
      flagsToCreate.push({
        flagType: 'CONSTRUCTION_DELAY',
        color: delayDays > DELAY_THRESHOLD_DAYS * 2 ? 'RED' : 'YELLOW',
        reason: `Projected delivery delayed by ${delayDays} days.`,
        thresholdValue: DELAY_THRESHOLD_DAYS,
        observedValue: delayDays,
      });
    }
  }

  if (project.financingStatus === 'ISSUE') {
    flagsToCreate.push({
      flagType: 'FINANCING_ISSUE',
      color: 'RED',
      reason: 'Financing issue reported by project team.',
      thresholdValue: 1,
      observedValue: 1,
    });
  }

  if (project.permittingStatus === 'ISSUE') {
    flagsToCreate.push({
      flagType: 'PERMITTING_ISSUE',
      color: 'YELLOW',
      reason: 'Permitting issue reported by project team.',
      thresholdValue: 1,
      observedValue: 1,
    });
  }

  const variancePercent =
    project.budgetPlanned > 0 ? ((project.budgetActual - project.budgetPlanned) / project.budgetPlanned) * 100 : 0;
  if (variancePercent > BUDGET_VARIANCE_THRESHOLD_PERCENT) {
    flagsToCreate.push({
      flagType: 'BUDGET_VARIANCE',
      color: variancePercent > BUDGET_VARIANCE_THRESHOLD_PERCENT * 2 ? 'RED' : 'YELLOW',
      reason: `Budget variance is ${variancePercent.toFixed(2)}%.`,
      thresholdValue: BUDGET_VARIANCE_THRESHOLD_PERCENT,
      observedValue: variancePercent,
    });
  }

  if (flagsToCreate.length > 0) {
    await ProjectRiskFlagModel.insertMany(
      flagsToCreate.map((flag) => ({
        ...flag,
        projectId: project._id,
        raisedAt: new Date(),
      }))
    );
  }

  let scheduleStatus: ScheduleStatus = 'ON_SCHEDULE';
  if (flagsToCreate.some((flag) => flag.color === 'RED')) {
    scheduleStatus = 'DELAYED';
  } else if (flagsToCreate.some((flag) => flag.color === 'YELLOW')) {
    scheduleStatus = 'AT_RISK';
  }

  await ProgramProjectModel.findByIdAndUpdate(project._id, { scheduleStatus });

  const savedFlags = await ProjectRiskFlagModel.find({ projectId: project._id }).sort({ raisedAt: -1 }).lean();
  return {
    projectId,
    scheduleStatus,
    riskFlags: savedFlags.map((flag) => ({
      flagType: flag.flagType,
      color: flag.color,
      reason: flag.reason,
      thresholdValue: flag.thresholdValue,
      observedValue: flag.observedValue,
      raisedAt: flag.raisedAt,
    })),
  };
};

export const getProgramSummaryMetrics = async () => {
  const [
    projects,
    occupiedUnits,
    totalUnitDocs,
    activeTenancies,
    participationAgg,
    complianceStatuses,
  ] = await Promise.all([
    ProgramProjectModel.find().select('unitsDelivered unitsPlanned').lean(),
    UnitModel.countDocuments({ status: 'OCCUPIED' }),
    UnitModel.countDocuments(),
    TenancyModel.countDocuments({ status: 'ACTIVE' }),
    TepaParticipationLedgerModel.aggregate([
      {
        $group: {
          _id: null,
          activeCount: { $sum: { $cond: [{ $eq: ['$participationStatus', 'ACTIVE'] }, 1, 0] } },
          totalValue: { $sum: '$totalAccumulationValue' },
        },
      },
    ]),
    ProgramComplianceRecordModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const totalProjects = projects.length;
  const unitsDelivered = projects.reduce((sum, p) => sum + p.unitsDelivered, 0);
  const unitsPlanned = projects.reduce((sum, p) => sum + p.unitsPlanned, 0);
  const deliveryBase = unitsDelivered > 0 ? unitsDelivered : totalUnitDocs;
  const occupancyRate = deliveryBase > 0 ? occupiedUnits / deliveryBase : 0;

  const participatingTenantCount = participationAgg[0]?.activeCount ?? 0;
  const aggregateParticipationValue = participationAgg[0]?.totalValue ?? 0;
  const tenantParticipationRate = activeTenancies > 0 ? participatingTenantCount / activeTenancies : 0;

  const complianceMap = new Map(
    (complianceStatuses as Array<{ _id: string; count: number }>).map((r) => [r._id, r.count])
  );
  let programCompliance: 'On Track' | 'At Risk' | 'Off Track' = 'On Track';
  if ((complianceMap.get('NON_COMPLIANT') ?? 0) > 0) programCompliance = 'Off Track';
  else if ((complianceMap.get('AT_RISK') ?? 0) > 0) programCompliance = 'At Risk';

  return {
    totalProjects,
    unitsDelivered,
    unitsPlanned,
    unitsOccupied: occupiedUnits,
    occupancyRate: Number(occupancyRate.toFixed(3)),
    tenantParticipationRate: Number(tenantParticipationRate.toFixed(3)),
    aggregateParticipationValue,
    programCompliance,
  };
};

export const getSpendAndVendorClassification = async () => {
  const [totalsResult, geoResult, categoryResult] = await Promise.all([
    VendorSpendRecordModel.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    VendorSpendRecordModel.aggregate([
      { $group: { _id: '$geographyTag', total: { $sum: '$amount' } } },
    ]),
    VendorSpendRecordModel.aggregate([
      { $group: { _id: '$vendorCategory', total: { $sum: '$amount' } } },
    ]),
  ]);

  const totalProjectSpend = totalsResult[0]?.total ?? 0;
  const geoMap = new Map((geoResult as Array<{ _id: string; total: number }>).map((r) => [r._id, r.total]));
  const categoryMap = new Map(
    (categoryResult as Array<{ _id: string; total: number }>).map((r) => [r._id, r.total])
  );

  return {
    totalProjectSpend,
    localCitySpend: geoMap.get('LOCAL_CITY') ?? 0,
    stateSpend: geoMap.get('STATE') ?? 0,
    nonLocalSpend: geoMap.get('NON_LOCAL') ?? 0,
    vendorCategories: {
      construction: categoryMap.get('CONSTRUCTION') ?? 0,
      maintenance: categoryMap.get('MAINTENANCE') ?? 0,
      professionalServices: categoryMap.get('PROFESSIONAL_SERVICES') ?? 0,
      other: categoryMap.get('OTHER') ?? 0,
    },
  };
};

export const getCohortLevelAggregation = async () => {
  const cohorts = await TepaParticipationLedgerModel.aggregate([
    {
      $group: {
        _id: '$entryYear',
        members: { $sum: 1 },
        activeMembers: {
          $sum: { $cond: [{ $eq: ['$participationStatus', 'ACTIVE'] }, 1, 0] },
        },
        avgAnnualAccumulation: { $avg: '$annualAccumulation' },
        totalCohortValue: { $sum: '$totalAccumulationValue' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return cohorts.map((cohort) => ({
    entryYear: cohort._id,
    avgAnnualAccumulation: Number((cohort.avgAnnualAccumulation ?? 0).toFixed(2)),
    retentionRate: cohort.members > 0 ? Number((cohort.activeMembers / cohort.members).toFixed(3)) : 0,
    totalCohortValue: cohort.totalCohortValue ?? 0,
  }));
};

export const calculatePropertyTaxImpact = (payload: Record<string, unknown>) => {
  const preDevelopmentAssessedValue = Number(payload.preDevelopmentAssessedValue ?? 0);
  const postDevelopmentAssessedValue = Number(payload.postDevelopmentAssessedValue ?? 0);
  const municipalMillageRate = Number(payload.municipalMillageRate ?? 0);

  if (preDevelopmentAssessedValue < 0 || postDevelopmentAssessedValue < 0 || municipalMillageRate < 0) {
    throw new AppError('Property tax inputs must be non-negative numbers', 400);
  }

  const netTaxBaseUplift = postDevelopmentAssessedValue - preDevelopmentAssessedValue;
  const annualPropertyTaxImpact = (netTaxBaseUplift * municipalMillageRate) / 1000;

  return {
    preDevelopmentAssessedValue,
    postDevelopmentAssessedValue,
    municipalMillageRate,
    netTaxBaseUplift,
    annualPropertyTaxImpact: Number(annualPropertyTaxImpact.toFixed(2)),
  };
};

export const getEconomicActivityAndTaxProxy = async (start?: Date, end?: Date) => {
  const matchStage: Record<string, unknown> = {};
  if (start != null || end != null) {
    matchStage.createdAt = {};
    if (start != null) (matchStage.createdAt as Record<string, Date>).$gte = start;
    if (end != null) (matchStage.createdAt as Record<string, Date>).$lte = end;
  }
  const pipeline: object[] =
    Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : [];
  pipeline.push(
    {
      $facet: {
        taxableConstruction: [
          { $match: { vendorCategory: 'CONSTRUCTION', taxable: true } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
        allVendor: [{ $group: { _id: null, total: { $sum: '$amount' } } }],
        ongoingOps: [
          { $match: { vendorCategory: { $ne: 'CONSTRUCTION' } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
      },
    },
    {
      $project: {
        taxableConstructionSpend: { $ifNull: [{ $arrayElemAt: ['$taxableConstruction.total', 0] }, 0] },
        vendorPaymentActivity: { $ifNull: [{ $arrayElemAt: ['$allVendor.total', 0] }, 0] },
        ongoingOperationsActivity: { $ifNull: [{ $arrayElemAt: ['$ongoingOps.total', 0] }, 0] },
      },
    }
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result] = await VendorSpendRecordModel.aggregate(pipeline as any[]);
  const taxableConstructionSpend = result?.taxableConstructionSpend ?? 0;
  const vendorPaymentActivity = result?.vendorPaymentActivity ?? 0;
  const ongoingOperationsActivity = result?.ongoingOperationsActivity ?? 0;
  const estimatedTaxableEconomicActivity = taxableConstructionSpend + ongoingOperationsActivity * 0.75;

  return {
    taxableConstructionSpend,
    vendorPaymentActivity,
    ongoingOperationsActivity,
    estimatedTaxableEconomicActivity: Number(estimatedTaxableEconomicActivity.toFixed(2)),
    salesUseTaxProxy: Number((estimatedTaxableEconomicActivity * 0.07).toFixed(2)),
    payrollTaxContribution: Number((estimatedTaxableEconomicActivity * 0.35 * 0.015).toFixed(2)),
    wageBaseGenerated: Number((estimatedTaxableEconomicActivity * 0.35).toFixed(2)),
  };
};

export const getTotalPublicBenefitSummary = async () => {
  const [projects, economicProxy] = await Promise.all([ProgramProjectModel.find().lean(), getEconomicActivityAndTaxProxy()]);

  const propertyTax = projects.reduce((sum, project) => {
    const pre = project.preDevelopmentAssessedValue ?? 0;
    const post = project.postDevelopmentAssessedValue ?? 0;
    const millage = project.municipalMillageRate ?? 0;
    return sum + ((post - pre) * millage) / 1000;
  }, 0);

  const jobsSupported = projects.reduce((sum, project) => sum + (project.jobsSupported ?? 0), 0);

  return {
    propertyTax: Number(propertyTax.toFixed(2)),
    salesUseTaxProxy: economicProxy.salesUseTaxProxy,
    payrollTax: economicProxy.payrollTaxContribution,
    jobsSupported,
    totalPublicBenefit: Number(
      (propertyTax + economicProxy.salesUseTaxProxy + economicProxy.payrollTaxContribution).toFixed(2)
    ),
  };
};

export const getPledgeTracking = async () => {
  const pledges = await ProgramPledgeRecordModel.find().lean();
  return pledges.map((pledge) => ({
    id: pledge._id.toString(),
    projectId: pledge.projectId.toString(),
    pledgeType: pledge.pledgeType,
    promised: pledge.promised,
    achieved: pledge.achieved,
    status: pledge.status === 'EXCEEDED' ? 'Exceeded' : pledge.status === 'AT_RISK' ? 'At Risk' : 'On Track',
  }));
};

export const getComplianceStatusAndAuditScheduler = async () => {
  const [statusCounts, reportingCounts, nextAudit] = await Promise.all([
    ProgramComplianceRecordModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ProgramComplianceRecordModel.aggregate([
      { $group: { _id: '$reportingComplete', count: { $sum: 1 } } },
    ]),
    ProgramComplianceRecordModel.find().sort({ nextAuditDate: 1 }).limit(1).select('nextAuditDate').lean(),
  ]);

  const statusMap = new Map((statusCounts as Array<{ _id: string; count: number }>).map((r) => [r._id, r.count]));
  const total = [...statusMap.values()].reduce((a, b) => a + b, 0);
  const reportingMap = new Map(
    (reportingCounts as Array<{ _id: boolean; count: number }>).map((r) => [String(r._id), r.count])
  );

  return {
    complianceOverview: {
      total,
      onTrack: statusMap.get('ON_TRACK') ?? 0,
      atRisk: statusMap.get('AT_RISK') ?? 0,
      nonCompliant: statusMap.get('NON_COMPLIANT') ?? 0,
    },
    reportingStatus: {
      fullyReported: reportingMap.get('true') ?? 0,
      missingReports: reportingMap.get('false') ?? 0,
    },
    nextAuditDate: nextAudit[0]?.nextAuditDate
      ? new Date((nextAudit[0] as any).nextAuditDate).toISOString()
      : null,
  };
};
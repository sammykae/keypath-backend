import { Request, Response } from 'express';
import { AppError } from '../../../core/errors/AppError';
import { errorResponse, successResponse } from '../../../core/utils/response';
import {
  calculatePropertyTaxImpact,
  createProject,
  createVendorSpendRecord,
  evaluateProjectRiskFlags,
  getCohortLevelAggregation,
  getComplianceStatusAndAuditScheduler,
  getEconomicActivityAndTaxProxy,
  getPledgeTracking,
  getProgramSummaryMetrics,
  getSpendAndVendorClassification,
  getTotalPublicBenefitSummary,
  listProjectsWithStatus,
  upsertPledge,
  upsertProgramCompliance,
  upsertTepaParticipation,
} from '../services/program.service';

const handleError = (res: Response, err: unknown) => {
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, 'PROGRAM_ERROR', err.message);
    return;
  }

  console.error('Program controller error:', err);
  errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
};

export const createProjectHandler = async (req: Request, res: Response) => {
  try {
    const project = await createProject(req.body as Record<string, unknown>);
    successResponse(res, project, 201);
  } catch (err) {
    handleError(res, err);
  }
};

export const listProjectsHandler = async (_req: Request, res: Response) => {
  try {
    const projects = await listProjectsWithStatus();
    successResponse(res, projects);
  } catch (err) {
    handleError(res, err);
  }
};

export const evaluateProjectRiskFlagsHandler = async (req: Request, res: Response) => {
  try {
    const result = await evaluateProjectRiskFlags(req.params.projectId);
    successResponse(res, result);
  } catch (err) {
    handleError(res, err);
  }
};

export const upsertTepaParticipationHandler = async (req: Request, res: Response) => {
  try {
    const record = await upsertTepaParticipation(req.body as Record<string, unknown>);
    successResponse(res, record);
  } catch (err) {
    handleError(res, err);
  }
};

export const upsertProgramComplianceHandler = async (req: Request, res: Response) => {
  try {
    const record = await upsertProgramCompliance(req.body as Record<string, unknown>);
    successResponse(res, record);
  } catch (err) {
    handleError(res, err);
  }
};

export const upsertPledgeHandler = async (req: Request, res: Response) => {
  try {
    const pledge = await upsertPledge(req.body as Record<string, unknown>);
    successResponse(res, pledge);
  } catch (err) {
    handleError(res, err);
  }
};

export const createVendorSpendRecordHandler = async (req: Request, res: Response) => {
  try {
    const record = await createVendorSpendRecord(req.body as Record<string, unknown>);
    successResponse(res, record, 201);
  } catch (err) {
    handleError(res, err);
  }
};

export const getProgramSummaryMetricsHandler = async (_req: Request, res: Response) => {
  try {
    const metrics = await getProgramSummaryMetrics();
    successResponse(res, metrics);
  } catch (err) {
    handleError(res, err);
  }
};

export const getSpendAndVendorClassificationHandler = async (_req: Request, res: Response) => {
  try {
    const data = await getSpendAndVendorClassification();
    successResponse(res, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const getCohortLevelAggregationHandler = async (_req: Request, res: Response) => {
  try {
    const data = await getCohortLevelAggregation();
    successResponse(res, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const calculatePropertyTaxImpactHandler = async (req: Request, res: Response) => {
  try {
    const data = calculatePropertyTaxImpact(req.body as Record<string, unknown>);
    successResponse(res, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const getEconomicActivityAndTaxProxyHandler = async (_req: Request, res: Response) => {
  try {
    const data = await getEconomicActivityAndTaxProxy();
    successResponse(res, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const getTotalPublicBenefitSummaryHandler = async (_req: Request, res: Response) => {
  try {
    const data = await getTotalPublicBenefitSummary();
    successResponse(res, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const getPledgeTrackingHandler = async (_req: Request, res: Response) => {
  try {
    const data = await getPledgeTracking();
    successResponse(res, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const getComplianceStatusAndAuditSchedulerHandler = async (_req: Request, res: Response) => {
  try {
    const data = await getComplianceStatusAndAuditScheduler();
    successResponse(res, data);
  } catch (err) {
    handleError(res, err);
  }
};
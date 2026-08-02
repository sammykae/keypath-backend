import mongoose from 'mongoose';
import { AppError } from '../../../core/errors/AppError';
import { CsvIngestionModel, ICsvIngestion, IPersistResult } from '../models/csv-ingestion.model';
import { getMappedRows } from './csv-processor.service';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { inviteTenant } from '../../landlord/services/landlordTenantActions.service';
import { writeAuditEvent } from '../../audit/services/audit.service';

/**
 * Persist stage of the import pipeline (validate → normalize → map → audit
 * → **persist**, per Laurel Q8). Only implemented for ingestionType TENANT
 * today — reuses `inviteTenant`, the same function the "Invite Tenant"
 * dialog calls, so persisted rows get identical business rules, audit
 * events, and invite emails as a manual invite.
 *
 * Opt-in and separate from /process: the validate/map/audit flow's existing
 * behavior is untouched. Call this only after status === COMPLETE.
 */
export async function persistTenantRows(
  ingestionId: string,
  actorUserId: mongoose.Types.ObjectId
): Promise<ICsvIngestion> {
  if (!mongoose.Types.ObjectId.isValid(ingestionId)) throw new AppError('Invalid ingestion id', 400);

  const record = await CsvIngestionModel.findById(ingestionId);
  if (!record) throw new AppError('Ingestion record not found', 404);
  if (record.ingestionType !== 'TENANT') {
    throw new AppError('Persist is only implemented for TENANT imports', 400);
  }
  if (record.status !== 'COMPLETE') {
    throw new AppError('Ingestion must be COMPLETE (validated) before persisting', 400);
  }
  if (record.persistStatus === 'PERSISTING') {
    throw new AppError('Persist is already in progress', 409);
  }

  record.persistStatus = 'PERSISTING';
  await record.save();

  const mappedRows = await getMappedRows(record);
  if (!mappedRows) {
    record.persistStatus = 'PERSIST_FAILED';
    await record.save();
    throw new AppError('Could not retrieve CSV file from storage', 422);
  }

  const results: IPersistResult[] = [];
  const seenEmailsInFile = new Set<string>();

  for (const mapped of mappedRows) {
    if (!mapped.valid) continue; // validation-stage failures are already reported in processingErrors

    const email = (mapped.values.email ?? '').trim().toLowerCase();
    const propertyRef = (mapped.values.propertyRef ?? '').trim();
    const unitRef = (mapped.values.unitRef ?? '').trim();
    const monthlyRent = Number(mapped.values.monthlyRent);
    const moveInDate = mapped.values.moveInDate ? new Date(mapped.values.moveInDate) : new Date();

    if (seenEmailsInFile.has(email)) {
      results.push({ row: mapped.row, email, status: 'ERROR', message: 'Duplicate email within this file' });
      continue;
    }
    seenEmailsInFile.add(email);

    if (!propertyRef || !unitRef) {
      results.push({
        row: mapped.row, email, status: 'SKIPPED',
        message: 'propertyRef and unitRef are both required to resolve a unit',
      });
      continue;
    }
    if (!monthlyRent || monthlyRent <= 0) {
      results.push({ row: mapped.row, email, status: 'SKIPPED', message: 'monthlyRent must be greater than 0' });
      continue;
    }

    try {
      const property = await PropertyModel.findOne({
        orgId: record.orgId,
        name: new RegExp(`^${escapeRegex(propertyRef)}$`, 'i'),
      }).lean();
      if (!property) {
        results.push({ row: mapped.row, email, status: 'ERROR', message: `Property "${propertyRef}" not found` });
        continue;
      }

      const unit = await UnitModel.findOne({
        propertyId: (property as any)._id,
        unitNumber: new RegExp(`^${escapeRegex(unitRef)}$`, 'i'),
      }).lean();
      if (!unit) {
        results.push({ row: mapped.row, email, status: 'ERROR', message: `Unit "${unitRef}" not found on "${propertyRef}"` });
        continue;
      }

      const leaseStart = moveInDate;
      const leaseEnd = mapped.values.leaseEndDate
        ? new Date(mapped.values.leaseEndDate)
        : new Date(leaseStart.getFullYear() + 1, leaseStart.getMonth(), leaseStart.getDate());

      await inviteTenant(actorUserId, {
        unitId: (unit as any)._id.toString(),
        email,
        rentAmount: monthlyRent,
        leaseStart: leaseStart.toISOString(),
        leaseEnd: leaseEnd.toISOString(),
      });

      results.push({ row: mapped.row, email, status: 'CREATED' });
    } catch (err) {
      results.push({
        row: mapped.row, email, status: 'ERROR',
        message: err instanceof AppError ? err.message : 'Unexpected error creating tenancy',
      });
    }
  }

  const tenantsCreated = results.filter((r) => r.status === 'CREATED').length;

  record.persistStatus = 'PERSISTED';
  record.persistResults = results;
  record.tenantsCreated = tenantsCreated;
  await record.save();

  await writeAuditEvent({
    actorUserId,
    orgId: record.orgId,
    action: 'CSV_TENANTS_PERSISTED',
    entityType: 'CsvIngestion',
    entityId: record._id,
    diff: {
      before: null,
      after: { tenantsCreated, errors: results.filter((r) => r.status === 'ERROR').length, skipped: results.filter((r) => r.status === 'SKIPPED').length },
    },
  });

  return record;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { TepaParticipationLedgerModel } from '../../program/models/program.model';
import { CreditAccountModel } from '../../ledger/models/creditAccountModel';
import { CreditEventModel } from '../../ledger/models/creditEventModel';
import { fetchTenantParticipationCollectionByPropertyId } from './tenantParticipationCollectionSource.service';

export async function buildPropertyAiContextPayload(
  propertyId: mongoose.Types.ObjectId
): Promise<Record<string, unknown> | null> {
  const property = await PropertyModel.findById(propertyId).lean();
  if (!property) return null;

  const tenantParticipationCollectionDocs =
    await fetchTenantParticipationCollectionByPropertyId(propertyId);

  const units = await UnitModel.find({ propertyId })
    .select('status rent beds baths unitNumber')
    .lean();

  const unitIds = units.map((u) => u._id);
  const statusCounts: Record<string, number> = {};
  let rentSum = 0;
  for (const u of units) {
    statusCounts[u.status] = (statusCounts[u.status] || 0) + 1;
    rentSum += u.rent || 0;
  }

  const tenancies =
    unitIds.length === 0
      ? []
      : await TenancyModel.find({ unitId: { $in: unitIds }, status: 'ACTIVE' })
          .select('tenantUserId unitId leaseStart leaseEnd rentAmount')
          .lean();

  const tenantUserIds = [
    ...new Set(tenancies.map((t) => String(t.tenantUserId))),
  ].map((id) => new mongoose.Types.ObjectId(id));

  const participationRows =
    tenantUserIds.length === 0
      ? []
      : await TepaParticipationLedgerModel.find({ tenantId: { $in: tenantUserIds } })
          .select('entryYear participationStatus annualAccumulation totalAccumulationValue')
          .lean()
          .limit(500);

  const tepaStatusCounts: Record<string, number> = {};
  let sumAnnual = 0;
  let sumTotalValue = 0;
  for (const row of participationRows) {
    tepaStatusCounts[row.participationStatus] = (tepaStatusCounts[row.participationStatus] || 0) + 1;
    sumAnnual += row.annualAccumulation || 0;
    sumTotalValue += row.totalAccumulationValue || 0;
  }

  const accounts =
    unitIds.length === 0
      ? []
      : await CreditAccountModel.find({ unitId: { $in: unitIds } }).select('_id').lean();
  const accountIds = accounts.map((a) => a._id);

  let eventTypeTotals: Record<string, number> = {};
  let lastOccurredAt: Date | null = null;
  if (accountIds.length > 0) {
    const grouped = await CreditEventModel.aggregate<{ _id: string; total: number }>([
      { $match: { accountId: { $in: accountIds } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]);
    eventTypeTotals = Object.fromEntries(grouped.map((g) => [g._id, g.total]));

    const latest = await CreditEventModel.findOne({ accountId: { $in: accountIds } })
      .sort({ occurredAt: -1 })
      .select('occurredAt')
      .lean();
    lastOccurredAt = latest?.occurredAt ?? null;
  }

  return {
    properties: {
      id: propertyId.toString(),
      name: property.name,
      type: property.type,
      status: property.status,
      tokenizedPct: property.tokenizedPct,
      address: {
        city: property.address?.city,
        state: property.address?.state,
        postalCode: property.address?.postalCode,
        country: property.address?.country,
      },
      units: {
        count: units.length,
        statusCounts,
        aggregateScheduledRent: rentSum,
      },
    },
    tenant_participation: {
      tenant_participation_collection: tenantParticipationCollectionDocs,
      active_tenancy_count: tenancies.length,
      tepa_participation_ledger: {
        rowCount: participationRows.length,
        participationStatusCounts: tepaStatusCounts,
        sumAnnualAccumulation: sumAnnual,
        sumTotalAccumulationValue: sumTotalValue,
      },
    },
    ledgers: {
      credit_accounts_for_property_units: accounts.length,
      credit_event_totals_by_type: eventTypeTotals,
      last_credit_event_at: lastOccurredAt,
    },
  };
}

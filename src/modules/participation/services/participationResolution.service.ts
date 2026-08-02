import mongoose from "mongoose";
import { AppError } from "../../../core/errors/AppError";
import { UnitModel } from "../../units/models/unit.model";
import { TenancyModel } from "../../tenancies/models/tenancyModel";
import { User } from "../../auth/models/user.model";
import { TenantInviteModel } from "../../invites/models/tenantInvite.model";
import { TepaEnrollment } from "../../tepa/models/tepa-enrollment.model";
import { PropertyModel } from "../../properties/models/propertyModel";
import type { ParticipationResolveQueryDTO } from "../dto/participationQueryDTO";
import type { OccupiedUnitParticipationRecord, ParticipationType } from "../types/participationTypes";

function isoOrNull(d: Date | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function participationTypeFromFlags(args: {
  rewardsEligible: boolean;
  tepaEligible: boolean;
  tepaEnrolledActive: boolean;
}): ParticipationType {
  const { rewardsEligible, tepaEligible, tepaEnrolledActive } = args;
  if (rewardsEligible && tepaEnrolledActive) return "BOTH";
  if (rewardsEligible) return "RPA";
  if (tepaEligible) return "TEPA";
  return "NONE";
}

export async function resolveOccupiedUnitsParticipation(
  requesterOrgId: string,
  query: ParticipationResolveQueryDTO
): Promise<OccupiedUnitParticipationRecord[]> {
  const orgOid = new mongoose.Types.ObjectId(requesterOrgId);

  let scopedTenancies: Array<{
    _id: mongoose.Types.ObjectId;
    tenantUserId: mongoose.Types.ObjectId;
    unitId: mongoose.Types.ObjectId;
    leaseStart: Date;
    leaseEnd: Date;
  }> = [];

  if (query.propertyId) {
    const propertyOid = new mongoose.Types.ObjectId(query.propertyId);
    const units = await UnitModel.find({ propertyId: propertyOid }).select("_id").lean();
    const unitIds = units.map((u) => (u as any)._id as mongoose.Types.ObjectId);
    scopedTenancies = await TenancyModel.find({
      unitId: { $in: unitIds },
      status: "ACTIVE",
    })
      .select("tenantUserId unitId leaseStart leaseEnd")
      .lean();
  } else if (query.unitId) {
    const unitOid = new mongoose.Types.ObjectId(query.unitId);
    scopedTenancies = await TenancyModel.find({
      unitId: unitOid,
      status: "ACTIVE",
    })
      .select("tenantUserId unitId leaseStart leaseEnd")
      .lean();
  } else if (query.tenancyId) {
    const tenancyOid = new mongoose.Types.ObjectId(query.tenancyId);
    const tenancy = await TenancyModel.findById(tenancyOid)
      .select("tenantUserId unitId leaseStart leaseEnd status")
      .lean();
    if (!tenancy || tenancy.status !== "ACTIVE") return [];
    scopedTenancies = [
      {
        _id: tenancy._id,
        tenantUserId: tenancy.tenantUserId,
        unitId: tenancy.unitId,
        leaseStart: tenancy.leaseStart,
        leaseEnd: tenancy.leaseEnd,
      },
    ];
  } else if (query.tenantId) {
    const tenantUserOid = new mongoose.Types.ObjectId(query.tenantId);
    scopedTenancies = await TenancyModel.find({
      tenantUserId: tenantUserOid,
      status: "ACTIVE",
    })
      .select("tenantUserId unitId leaseStart leaseEnd")
      .lean();
  }

  if (!scopedTenancies.length) return [];

  const unitIds = Array.from(new Set(scopedTenancies.map((t) => t.unitId.toString()))).map(
    (id) => new mongoose.Types.ObjectId(id)
  );
  const tenantUserIds = Array.from(new Set(scopedTenancies.map((t) => t.tenantUserId.toString()))).map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const units = await UnitModel.find({
    _id: { $in: unitIds },
  })
    .select("_id unitNumber propertyId status")
    .lean();

  const unitById = new Map<string, any>();
  for (const u of units) unitById.set((u as any)._id.toString(), u);

  const scopedPropertyIds = Array.from(
    new Set(units.map((u) => ((u as any).propertyId as mongoose.Types.ObjectId).toString()))
  );

  const allowedProperties = await PropertyModel.find({
    _id: { $in: scopedPropertyIds.map((id) => new mongoose.Types.ObjectId(id)) },
    orgId: orgOid,
  })
    .select("_id")
    .lean();

  const allowedPropertyIds = new Set(allowedProperties.map((p) => (p as any)._id.toString()));

  const tenanciesInOrg = scopedTenancies.filter((t) => {
    const unit = unitById.get(t.unitId.toString());
    if (!unit) return false;
    const propertyId = (unit as any).propertyId?.toString?.() ?? null;
    if (!propertyId) return false;
    return allowedPropertyIds.has(propertyId);
  });

  if (query.propertyId) {
    const propAllowed = allowedPropertyIds.has(query.propertyId);
    if (!propAllowed) throw new AppError("Forbidden: property not in your org", 403);
  }

  if (!tenanciesInOrg.length) return [];

  const tenantUsers = await User.find({ _id: { $in: tenantUserIds } })
    .select("_id email role status profile.firstName profile.lastName")
    .lean();

  const userById = new Map<string, any>();
  for (const u of tenantUsers) userById.set((u as any)._id.toString(), u);

  const tepaEnrollments = await TepaEnrollment.find({
    tenantUserId: { $in: tenantUserIds },
    unitId: { $in: unitIds },
    status: "ACTIVE",
  })
    .select("tenantUserId unitId status")
    .lean();

  const tepaByTenantUnit = new Set<string>();
  for (const e of tepaEnrollments) {
    tepaByTenantUnit.add(
      `${(e as any).tenantUserId.toString()}|${(e as any).unitId.toString()}`
    );
  }

  // Accepted invite (participationModel + requiredAgreements) is the validation input for BOTH/RPA/TEPA.
  const scopedTenanciesByProperty = new Map<
    string,
    Array<{ tenantUserId: mongoose.Types.ObjectId; unitId: mongoose.Types.ObjectId; tenantEmail: string }>
  >();

  for (const t of tenanciesInOrg) {
    const unit = unitById.get(t.unitId.toString());
    if (!unit) continue;
    const propertyId = (unit as any).propertyId.toString();
    const tenantUser = userById.get(t.tenantUserId.toString());
    if (!tenantUser?.email) continue;
    const tenantEmail = String(tenantUser.email).toLowerCase();
    const arr = scopedTenanciesByProperty.get(propertyId) ?? [];
    arr.push({ tenantUserId: t.tenantUserId, unitId: t.unitId, tenantEmail });
    scopedTenanciesByProperty.set(propertyId, arr);
  }

  const inviteByTenantEmailUnit = new Map<string, any>(); // key: `${tenantEmail}|${unitId}`

  for (const [propertyId, entries] of scopedTenanciesByProperty.entries()) {
    const emails = Array.from(new Set(entries.map((e) => e.tenantEmail)));
    const uids = Array.from(new Set(entries.map((e) => e.unitId.toString()))).map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    // Most recent acceptedAt for that (tenantEmail, unitId, propertyId) wins.
    const invites = await TenantInviteModel.find({
      propertyId: new mongoose.Types.ObjectId(propertyId),
      unitId: { $in: uids },
      tenantEmail: { $in: emails },
      status: "ACCEPTED",
    })
      .sort({ acceptedAt: -1 })
      .select("tenantEmail unitId requiredAgreements participationModel acceptedAt status")
      .lean();

    for (const inv of invites) {
      const tenantEmail = String((inv as any).tenantEmail).toLowerCase();
      const unitId = (inv as any).unitId.toString();
      const key = `${tenantEmail}|${unitId}`;
      if (!inviteByTenantEmailUnit.has(key)) {
        inviteByTenantEmailUnit.set(key, inv);
      }
    }
  }

  const records: OccupiedUnitParticipationRecord[] = tenanciesInOrg.map((t) => {
    const unit = unitById.get(t.unitId.toString());
    const tenantUser = userById.get(t.tenantUserId.toString());
    if (!unit || !tenantUser) {
      // Should not happen because we already built tenanciesInOrg from unitById/userById availability.
      return {
        unit: {
          unitId: t.unitId.toString(),
          unitNumber: null,
          propertyId: "",
          unitStatus: "UNKNOWN",
          leaseStart: isoOrNull(t.leaseStart),
          leaseEnd: isoOrNull(t.leaseEnd),
        },
        tenant: { tenantUserId: t.tenantUserId.toString(), email: null, name: null },
        participationType: "NONE",
        rewardsEligibility: false,
        tepaEligibility: false,
      };
    }

    const tenantEmail = String(tenantUser.email).toLowerCase();
    const unitId = t.unitId.toString();
    const invite = inviteByTenantEmailUnit.get(`${tenantEmail}|${unitId}`);
    const requiredAgreements: string[] = invite?.requiredAgreements ?? [];

    const rewardsEligible = requiredAgreements.includes("RPA") || requiredAgreements.includes("RPA_AND_TEPA");
    const tepaEligible = requiredAgreements.includes("TEPA") || requiredAgreements.includes("RPA_AND_TEPA");

    const tepaEnrolledActive =
      tepaEligible && tepaByTenantUnit.has(`${t.tenantUserId.toString()}|${unitId}`);

    const participationType = participationTypeFromFlags({
      rewardsEligible,
      tepaEligible,
      tepaEnrolledActive,
    });

    const name =
      tenantUser.profile?.firstName || tenantUser.profile?.lastName
        ? `${tenantUser.profile?.firstName ?? ""} ${tenantUser.profile?.lastName ?? ""}`.trim() || null
        : null;

    return {
      unit: {
        unitId: unitId,
        unitNumber: (unit as any).unitNumber?.toString?.() ?? null,
        propertyId: (unit as any).propertyId.toString(),
        unitStatus: (unit as any).status?.toString?.() ?? "UNKNOWN",
        leaseStart: isoOrNull(t.leaseStart),
        leaseEnd: isoOrNull(t.leaseEnd),
      },
      tenant: {
        tenantUserId: t.tenantUserId.toString(),
        email: tenantUser.email?.toString?.() ?? null,
        name,
      },
      participationType,
      rewardsEligibility: rewardsEligible,
      tepaEligibility: tepaEligible,
    };
  });

  // Keep output stable across calls for dashboards/exports.
  records.sort((a, b) => {
    const au = a.unit.unitNumber ?? "";
    const bu = b.unit.unitNumber ?? "";
    return au.localeCompare(bu);
  });

  return records;
}


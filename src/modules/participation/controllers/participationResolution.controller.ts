import { Response } from "express";
import { ZodError } from "zod";
import { AuthenticatedRequest } from "../../auth/types/auth-request";
import { resolveLandlordOrgId } from "../../dashboard/services/landlordDashboard.service";
import { ParticipationResolveQuerySchema } from "../dto/participationQueryDTO";
import { resolveOccupiedUnitsParticipation } from "../services/participationResolution.service";

function csvEscape(value: string | number | boolean | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function getOccupiedUnitsParticipationHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.auth?._id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const query = ParticipationResolveQuerySchema.parse({
      propertyId: typeof req.query.propertyId === "string" ? req.query.propertyId : undefined,
      unitId: typeof req.query.unitId === "string" ? req.query.unitId : undefined,
      tenancyId: typeof req.query.tenancyId === "string" ? req.query.tenancyId : undefined,
      tenantId: typeof req.query.tenantId === "string" ? req.query.tenantId : undefined,
    });

    const orgId = await resolveLandlordOrgId(userId as any);
    const data = await resolveOccupiedUnitsParticipation(orgId, query);
    res.status(200).json({ success: true, data });
  } catch (err: any) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "Validation error", details: err.issues });
      return;
    }
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function exportOccupiedUnitsParticipationCsvHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.auth?._id;
    if (!userId) {
      res.status(401).send("Unauthorized");
      return;
    }

    const query = ParticipationResolveQuerySchema.parse({
      propertyId: typeof req.query.propertyId === "string" ? req.query.propertyId : undefined,
      unitId: typeof req.query.unitId === "string" ? req.query.unitId : undefined,
      tenancyId: typeof req.query.tenancyId === "string" ? req.query.tenancyId : undefined,
      tenantId: typeof req.query.tenantId === "string" ? req.query.tenantId : undefined,
    });

    const orgId = await resolveLandlordOrgId(userId as any);
    const rows = await resolveOccupiedUnitsParticipation(orgId, query);

    const header = [
      "propertyId",
      "unitId",
      "unitNumber",
      "tenantUserId",
      "tenantEmail",
      "tenantName",
      "participationType",
      "rewardsEligibility",
      "tepaEligibility",
      "leaseStart",
      "leaseEnd",
    ];

    const lines: string[] = [];
    lines.push(header.map(csvEscape).join(","));

    for (const r of rows) {
      lines.push(
        [
          r.unit.propertyId,
          r.unit.unitId,
          r.unit.unitNumber ?? "",
          r.tenant.tenantUserId,
          r.tenant.email ?? "",
          r.tenant.name ?? "",
          r.participationType,
          r.rewardsEligibility,
          r.tepaEligibility,
          r.unit.leaseStart ?? "",
          r.unit.leaseEnd ?? "",
        ].map(csvEscape).join(",")
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="unit-participation-export.csv"');
    res.status(200).send(lines.join("\n"));
  } catch (err: any) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "Validation error", details: err.issues });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
}


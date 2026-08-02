import { Request, Response } from 'express';
import { successResponse, errorResponse } from '../../../core/utils/response';
import { isDemoModeEnabled } from '../../../core/utils/demo.utils';

import { Organization } from '../../orgs/models/organization.model';
import { Membership } from '../../orgs/models/membership.model';
import { TepaEnrollment } from '../../tepa/models/tepa-enrollment.model';
import { writeAuditEvent } from '../../audit/services/audit.service';
import {
  DEMO_ORG_NAME,
  DEMO_TEPA_CONSENT_VERSION,
  DEMO_UNIT_OBJECT_ID,
} from '../data/demo.data';

export const seedDemoData = async (req: Request, res: Response) => {
  const user = req.user as any;

  // Codex: use shared demo flag parser to avoid inverted env parsing edge-cases.
  if (!isDemoModeEnabled()) {
    return errorResponse(
      res,
      403,
      'DEMO_MODE_DISABLED',
      'Demo seeding is disabled'
    );
  }

  // 2️⃣ ADMIN guard
  if (user.role !== 'ADMIN') {
    return errorResponse(
      res,
      403,
      'FORBIDDEN',
      'Admin only endpoint'
    );
  }

  // Codex: keep org seeding idempotent so repeated runs stay safe.
  let org = await Organization.findOne({ name: DEMO_ORG_NAME });
  let createdOrg = false;

  if (!org) {
    org = await Organization.create({
      name: DEMO_ORG_NAME,
      type: 'LANDLORD_ORG',
      primaryContactUserId: user._id,
    });
    createdOrg = true;
  }

  await Membership.findOneAndUpdate(
    { userId: user._id, orgId: org._id },
    { $set: { roleInOrg: 'OWNER', status: 'active' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Codex: use stable unit id so TEPA seed does not create a new unit link each run.
  const demoUnitId = DEMO_UNIT_OBJECT_ID;

  const existingTepa = await TepaEnrollment.findOne({
    tenantUserId: user._id,
    unitId: demoUnitId,
    status: 'ACTIVE',
  });
  let createdTepa = false;

  if (!existingTepa) {
    await TepaEnrollment.create({
      tenantUserId: user._id,
      unitId: demoUnitId,
      status: 'ACTIVE',
      effectiveDate: new Date(),
      consentVersion: DEMO_TEPA_CONSENT_VERSION,
      acceptedAt: new Date(),
    });
    createdTepa = true;
  }

  /* ---------------------------------------------------------------------- */
  /*                             AUDIT EVENT                                 */
  /* ---------------------------------------------------------------------- */

  await writeAuditEvent({
    actorUserId: user._id,
    action: 'DEMO_DATA_SEEDED',
    entityType: 'System',
    diff: {
      before: null,
      after: {
        org: DEMO_ORG_NAME,
        tepa: 'ACTIVE',
        createdOrg,
        createdTepa,
      },
    },
  });

  return successResponse(res, {
    message: 'Demo data seeded successfully',
    orgId: org._id,
  });
};

// BE-502: one-time backfill to populate normalizedName, searchKeywords,
// location, tenantId, unitId, and propertyId on Tenant, Property, and Unit documents.
// Run with: npx ts-node scripts/backfill-search-fields.ts
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { TenantModel } from '../src/modules/tenant/models/tenants.models';
import { PropertyModel } from '../src/modules/properties/models/propertyModel';
import { UnitModel } from '../src/modules/units/models/unit.model';
import { TenancyModel } from '../src/modules/tenancies/models/tenancyModel';
import { User } from '../src/modules/auth/models/user.model';

dotenv.config();

async function backfillTenants(): Promise<void> {
  const tenants = await TenantModel.find({}).lean();
  let updated = 0;

  for (const t of tenants) {
    const lower = t.fullName.toLowerCase().trim();
    const parts = lower.split(/\s+/).filter(Boolean);
    await TenantModel.updateOne(
      { _id: t._id },
      {
        $set: {
          normalizedName: lower,
          searchKeywords: [...new Set(parts)]
        }
      }
    );
    updated++;
  }

  console.log(`Tenants backfilled: ${updated}`);
}

async function backfillProperties(): Promise<void> {
  const properties = await PropertyModel.find({}).lean();
  let updated = 0;

  for (const p of properties) {
    const nameLower = p.name.toLowerCase().trim();
    const city = (p.address?.city ?? '').trim();
    const state = (p.address?.state ?? '').trim();
    const location = [city, state].filter(Boolean).join(', ');
    const nameParts = nameLower.split(/\s+/).filter(Boolean);
    const locationParts = location.toLowerCase().split(/[\s,]+/).filter(Boolean);
    await PropertyModel.updateOne(
      { _id: p._id },
      {
        $set: {
          location,
          normalizedName: nameLower,
          searchKeywords: [...new Set([...nameParts, ...locationParts])]
        }
      }
    );
    updated++;
  }

  console.log(`Properties backfilled: ${updated}`);
}

async function backfillUnits(): Promise<void> {
  const units = await UnitModel.find({}).lean();
  let updated = 0;

  for (const u of units) {
    const numLower = u.unitNumber.toLowerCase().trim();
    const parts = ['unit', numLower, ...numLower.split(/[\s\-\/]+/).filter(Boolean)];
    if (u.label) {
      const labelLower = u.label.toLowerCase().trim();
      parts.push(...labelLower.split(/\s+/).filter(Boolean));
    }
    await UnitModel.updateOne(
      { _id: u._id },
      {
        $set: {
          normalizedName: `unit ${numLower}`,
          searchKeywords: [...new Set(parts)]
        }
      }
    );
    updated++;
  }

  console.log(`Units backfilled: ${updated}`);
}

async function backfillRelationships(): Promise<void> {
  const activeTenancies = await TenancyModel.find({ status: 'ACTIVE' }).lean();
  let tenantLinks = 0;
  let unitLinks = 0;

  for (const tenancy of activeTenancies) {
    const unit = await UnitModel.findById(tenancy.unitId).lean();
    if (!unit) continue;

    // Resolve the TenantModel doc from the auth User
    const authUser = await User.findById(tenancy.tenantUserId).lean();
    if (!authUser) continue;

    const tenantCore = await TenantModel.findOne({ email: authUser.email }).lean();
    if (tenantCore) {
      await TenantModel.updateOne(
        { _id: tenantCore._id },
        { $set: { unitId: unit._id, propertyId: unit.propertyId } }
      );
      await UnitModel.updateOne(
        { _id: unit._id },
        { $set: { tenantId: tenantCore._id } }
      );
      tenantLinks++;
      unitLinks++;
    }
  }

  console.log(`Tenant→Unit/Property links set: ${tenantLinks}`);
  console.log(`Unit→Tenant links set: ${unitLinks}`);
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  await backfillTenants();
  await backfillProperties();
  await backfillUnits();
  await backfillRelationships();

  await mongoose.disconnect();
  console.log('Backfill complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

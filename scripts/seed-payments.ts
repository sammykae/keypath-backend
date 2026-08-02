/**
 * Demo seed: 6–12 months payment history for a tenant.
 * Requires tenant to have an ACTIVE tenancy (for unitId, propertyId, orgId).
 * Usage: TENANT_USER_ID=<objectId> ts-node scripts/seed-payments.ts
 * Or run with default tenant id (set in .env or pass as first arg).
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/core/config/db';
import { PaymentModel } from '../src/modules/payments/models/payment.model';
import { TenancyModel } from '../src/modules/tenancies/models/tenancyModel';
import { UnitModel } from '../src/modules/units/models/unit.model';
import { PropertyModel } from '../src/modules/properties/models/propertyModel';

dotenv.config();

const MONTHS_TO_SEED = 12;

async function seedPayments(tenantUserId: string) {
  if (!mongoose.Types.ObjectId.isValid(tenantUserId)) {
    throw new Error('Invalid TENANT_USER_ID');
  }
  const tenantId = new mongoose.Types.ObjectId(tenantUserId);

  const tenancy = await TenancyModel.findOne({
    tenantUserId: tenantId,
    status: 'ACTIVE',
  }).lean();
  if (!tenancy) {
    throw new Error(
      'No ACTIVE tenancy found for tenant. Create a tenancy first.'
    );
  }

  const unit = await UnitModel.findById(tenancy.unitId).lean();
  if (!unit) {
    throw new Error('Unit not found for tenancy');
  }

  const property = await PropertyModel.findById(unit.propertyId).lean();
  if (!property) {
    throw new Error('Property not found for unit');
  }

  const unitId = (tenancy as any).unitId;
  const propertyId = unit.propertyId;
  const orgId = (property as any).orgId;
  const now = new Date();
  const created: string[] = [];

  for (let i = 0; i < MONTHS_TO_SEED; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const dueDate = new Date(d.getFullYear(), d.getMonth(), 5);

    const existing = await PaymentModel.findOne({
      tenantUserId: tenantId,
      period,
    }).lean();
    if (existing) continue;

    // current month DUE, past months PAID; optionally 1 FAILED for variety
    const isPaid = i > 0;
    const isFailed = i === 2; // 2 months ago = FAILED for demo
    const paidAt = isPaid && !isFailed
      ? new Date(dueDate.getTime() + 2 * 24 * 60 * 60 * 1000)
      : undefined;
    let status: 'DUE' | 'PAID' | 'LATE' | 'FAILED';
    if (i === 0) status = 'DUE';
    else if (isFailed) status = 'FAILED';
    else status = 'PAID';

    const amount = 1500 + Math.floor(Math.random() * 500);

    await PaymentModel.create({
      tenantUserId: tenantId,
      unitId,
      propertyId,
      orgId,
      tenancyId: (tenancy as any)._id,
      period,
      amount,
      status,
      dueDate,
      paidAt,
      method: isPaid && !isFailed ? 'ACH' : undefined,
      incentivesEarnedCredits: isPaid && !isFailed && i <= 3 ? 25 : undefined,
      metadata: isFailed ? { failureReason: 'Card declined' } : undefined,
    });
    created.push(period);
  }

  return created;
}

async function main() {
  const tenantUserId = process.env.TENANT_USER_ID || process.argv[2];
  if (!tenantUserId) {
    console.error('Set TENANT_USER_ID or pass tenant ObjectId as first argument');
    process.exit(1);
  }
  await connectDB();
  const created = await seedPayments(tenantUserId);
  console.log('Seeded payment history for tenant:', tenantUserId, 'periods:', created);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import mongoose from 'mongoose';
import { config } from 'dotenv';
import { TenancyModel } from '../src/modules/tenancies/models/tenancyModel';
import { User } from '../src/modules/auth/models/user.model';

config();

async function cleanupOrphanedTenancies() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/keypath';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const tenancies = await TenancyModel.find().lean();
    console.log(`Found ${tenancies.length} total tenancies`);

    const orphaned = [];

    for (const tenancy of tenancies) {
      const user = await User.findById((tenancy as any).tenantUserId).lean();
      if (!user) {
        orphaned.push({
          tenancyId: (tenancy as any)._id,
          tenantUserId: (tenancy as any).tenantUserId,
          unitId: (tenancy as any).unitId,
        });
      }
    }

    if (orphaned.length === 0) {
      console.log('✓ No orphaned tenancies found');
      await mongoose.disconnect();
      return;
    }

    console.log(`\n⚠️  Found ${orphaned.length} orphaned tenancies:`);
    orphaned.forEach((t) => {
      console.log(`  - Tenancy ${t.tenancyId} references non-existent user ${t.tenantUserId}`);
    });

    console.log('\nDeleting orphaned tenancies...');
    const orphanedIds = orphaned.map((t) => t.tenancyId);
    const result = await TenancyModel.deleteMany({ _id: { $in: orphanedIds } });
    console.log(`✓ Deleted ${result.deletedCount} orphaned tenancies`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

cleanupOrphanedTenancies();

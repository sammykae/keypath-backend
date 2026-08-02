import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { RewardCatalogModel } from '../src/modules/tenant/models/rewardCatalog.model';

dotenv.config();

const DEFAULT_REWARDS = [
  { rewardId: 'rent-credit-50',        title: '$50 Rent Credit',              description: 'Apply $50 toward your next rent payment.',                  costCredits: 500,  category: 'rent credit', status: 'active', actionLabel: 'Redeem',    deliveryAmount: 50  },
  { rewardId: 'rent-credit-100',       title: '$100 Rent Credit',             description: 'Apply $100 toward your next rent payment.',                 costCredits: 1000, category: 'rent credit', status: 'active', actionLabel: 'Redeem',    deliveryAmount: 100 },
  { rewardId: 'gift-card-amazon-25',   title: '$25 Amazon Gift Card',         description: 'Digital Amazon gift card sent to your registered email.',   costCredits: 250,  category: 'gift card',   status: 'active', actionLabel: 'Redeem',    deliveryAmount: 25  },
  { rewardId: 'gift-card-amazon-50',   title: '$50 Amazon Gift Card',         description: 'Digital Amazon gift card sent to your registered email.',   costCredits: 500,  category: 'gift card',   status: 'active', actionLabel: 'Redeem',    deliveryAmount: 50  },
  { rewardId: 'service-cleaning',      title: 'One-Time Cleaning Service',    description: 'Professional cleaning for your unit.',                      costCredits: 300,  category: 'services',    status: 'active', actionLabel: 'Apply Now', deliveryAmount: null },
  { rewardId: 'service-maintenance',   title: 'Priority Maintenance Request', description: 'Move your maintenance request to the front of the queue.', costCredits: 100,  category: 'services',    status: 'active', actionLabel: 'Apply Now', deliveryAmount: null },
];

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI required');
    process.exit(1);
  }
  await mongoose.connect(uri);

  for (const r of DEFAULT_REWARDS) {
    await RewardCatalogModel.findOneAndUpdate(
      { rewardId: r.rewardId, orgId: null },
      { $set: { ...r, orgId: null } },
      { upsert: true, new: true }
    );
    console.log(`Seeded: ${r.rewardId} (${r.category})`);
  }

  await mongoose.disconnect();
  console.log('Rewards seed done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

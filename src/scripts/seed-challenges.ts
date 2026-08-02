import '../core/config/env';
import mongoose from 'mongoose';
import { TenantChallengeModel } from '../modules/tenant/models/tenantChallenge.model';

const CHALLENGES = [
  {
    challengeId: 'pay-rent-early',
    title: 'Pay Rent Early!',
    description: 'Earn +120 reward points by paying rent 5 days before due date.',
    rewardPoints: 120,
    rewardTokens: 120,
    detail: 'Deadline: Oct 25',
    actionLabel: 'Claim Challenge',
    verificationMode: 'AUTOMATIC',
    creatorType: 'ADMIN',
    status: 'active',
  },
  {
    challengeId: 'eco-drive-paperless',
    title: 'Join the Eco-Drive',
    description: 'Get +200 reward points by switching to paperless billing.',
    rewardPoints: 200,
    rewardTokens: 200,
    detail: 'Status: Not Enrolled',
    actionLabel: 'Go Paperless',
    verificationMode: 'MANUAL',
    creatorType: 'ADMIN',
    status: 'active',
  },
  {
    challengeId: 'community-clean-up',
    title: 'Community Clean-Up Bonus',
    description: 'Volunteer for the weekend clean-up and get +500 reward points.',
    rewardPoints: 500,
    rewardTokens: 500,
    detail: 'Location: Maple Heights Courtyard',
    actionLabel: 'Sign Up',
    verificationMode: 'MANUAL',
    creatorType: 'ADMIN',
    location: 'Maple Heights Courtyard',
    status: 'active',
  },
];

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  for (const challenge of CHALLENGES) {
    await TenantChallengeModel.findOneAndUpdate(
      { challengeId: challenge.challengeId },
      challenge,
      { upsert: true, new: true }
    );
    console.log(`Upserted: ${challenge.challengeId}`);
  }

  await mongoose.disconnect();
  console.log('Done seeding challenges.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { buildFullIndex } from '../src/modules/search-index/services/search-index-builder.service';

dotenv.config();

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set in .env');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  console.log('Building search index...');
  const result = await buildFullIndex();

  console.log(`Done in ${result.durationMs}ms`);
  console.log(`  Properties indexed: ${result.properties}`);
  console.log(`  Units indexed:      ${result.units}`);
  console.log(`  Tenants indexed:    ${result.tenants}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import dotenv from 'dotenv';
import { connectDB } from '../src/core/config/db';
import { embedQuery } from '../src/modules/ai/services/embedder.service';
import { insertDoc } from '../src/modules/ask-ai/services/askAiKnowledge.service';

dotenv.config();

const SEED_DOCS = [
  {
    title: 'Landlord FAQ: Rent collection',
    sourceType: 'FAQ' as const,
    audienceRole: 'LANDLORD' as const,
    content:
      'Rent is collected on the first of each month. Tenants can pay via the portal or ACH. Late fees apply after the 5th.',
    version: '1.0',
  },
  {
    title: 'General: KeyPath platform overview',
    sourceType: 'PRODUCT_DOC' as const,
    audienceRole: 'ALL' as const,
    content:
      'KeyPath is a property tokenization and equity management platform. Landlords can tokenize properties; tenants and investors can participate.',
    version: '1.0',
  },
  {
    title: 'Tenant policy: Lease terms',
    sourceType: 'POLICY' as const,
    audienceRole: 'TENANT' as const,
    content:
      'Standard lease terms are 12 months. Early termination may incur a fee. Security deposit is held in escrow.',
    version: '1.0',
  },
];

const main = async () => {
  await connectDB();

  for (const doc of SEED_DOCS) {
    const embedding = await embedQuery(doc.content);
    await insertDoc({
      title: doc.title,
      sourceType: doc.sourceType,
      audienceRole: doc.audienceRole,
      content: doc.content,
      version: doc.version,
      embedding,
    });
    console.log(`Inserted: ${doc.title} (${doc.audienceRole})`);
  }

  console.log('Done. Seed docs inserted into askAiKnowledgeDocs.');
  process.exit(0);
};

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

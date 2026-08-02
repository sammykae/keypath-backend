import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { connectDB } from '../src/core/config/db';
import { chunkText } from '../src/modules/ai/services/chunker.service';
import { embedChunks } from '../src/modules/ai/services/embedder.service';
import { insertChunks } from '../src/modules/ai/services/knowledge.service';

dotenv.config();
const KNOWLEDGE_DIR = path.join(__dirname, '../knowledge');

// helper function to pause execution
const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

// Get all the markdown files in the knowledge directory
const getMarkdownFiles = (dir: string): { filePath: string; source: string }[] => {
  const files: { filePath: string; source: string }[] = [];
  
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    
    // recursively handle directories
    if (item.isDirectory()) {
      files.push(...getMarkdownFiles(fullPath));
    } else if (item.name.endsWith('.md')) {
      const relativePath = path.relative(KNOWLEDGE_DIR, fullPath);
      const source = relativePath.replace(/\.md$/, '').replace(/\//g, '_');
      files.push({ filePath: fullPath, source });
    }
  }
  
  return files;
};

// Ingest a single file
const ingestFile = async (filePath: string, source: string): Promise<number> => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const chunks = chunkText(content, source);
  const embeddedChunks = await embedChunks(chunks);
  await sleep(800);
  await insertChunks(embeddedChunks);
  return chunks.length;
};

const main = async () => {
  await connectDB();
  
  const files = getMarkdownFiles(KNOWLEDGE_DIR);
  
  if (files.length === 0) {
    console.log('No markdown files found in knowledge directory');
    process.exit(0);
  }
  
  let totalChunks = 0;
  for (const { filePath, source } of files) {
    const chunkCount = await ingestFile(filePath, source);
    totalChunks += chunkCount;
  }
    
  process.exit(0);
};

main().catch((error) => {
  console.error('Ingestion failed:', error);
  process.exit(1);
});

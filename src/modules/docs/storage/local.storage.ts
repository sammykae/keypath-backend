import fs from 'fs';
import path from 'path';
import { IStorage } from './storage.interface';

const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const LOCAL_UPLOAD_BASE_URL = process.env.LOCAL_UPLOAD_BASE_URL || process.env.BACKEND_URL || 'http://localhost:3000';

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export class LocalStorage implements IStorage {
  getUploadDir(): string {
    return UPLOAD_DIR;
  }

  async put(key: string, data: Buffer, contentType?: string): Promise<{ fileKey: string; publicUrl: string }> {
    const fullPath = path.join(UPLOAD_DIR, key);
    ensureDir(fullPath);
    fs.writeFileSync(fullPath, data);
    const base = LOCAL_UPLOAD_BASE_URL.replace(/\/$/, '');
    const publicUrl = `${base}/api/docs/files/${encodeURIComponent(key)}`;
    return { fileKey: key, publicUrl };
  }

  async get(key: string): Promise<Buffer | null> {
    const fullPath = path.join(UPLOAD_DIR, key);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath);
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(UPLOAD_DIR, key);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }
}

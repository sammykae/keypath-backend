import { IStorage } from './storage.interface';
import { S3Storage } from './s3.storage';
import { LocalStorage } from './local.storage';

function getStorage(): IStorage {
  const useLocal = process.env.USE_LOCAL_STORAGE === 'true' || !process.env.AWS_S3_BUCKET;
  return useLocal ? new LocalStorage() : new S3Storage();
}

export const storage = getStorage();
export { IStorage, S3Storage, LocalStorage };

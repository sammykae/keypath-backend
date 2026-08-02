export interface IStorage {
  put(key: string, data: Buffer, contentType?: string): Promise<{ fileKey: string; publicUrl: string }>;
  get(key: string): Promise<Buffer | null>;
  delete?(key: string): Promise<void>;
}

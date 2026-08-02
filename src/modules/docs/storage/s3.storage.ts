import { Readable } from 'stream';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IStorage } from './storage.interface';
import { logger } from '../../../core/logger';

const BUCKET = process.env.AWS_S3_BUCKET || '';
const REGION = process.env.AWS_REGION || 'us-east-1';
// Use path-style URL by default — virtual-hosted style breaks SSL for bucket names containing dots
const PUBLIC_BASE = process.env.AWS_S3_PUBLIC_BASE_URL || `https://s3.${REGION}.amazonaws.com/${BUCKET}`;

function getClient(): S3Client {
  const config: ConstructorParameters<typeof S3Client>[0] = {
    region: REGION,
    forcePathStyle: true,
  };
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  return new S3Client(config);
}

export class S3Storage implements IStorage {
  async put(key: string, data: Buffer, contentType?: string): Promise<{ fileKey: string; publicUrl: string }> {
    if (!BUCKET) {
      throw new Error('AWS_S3_BUCKET is not configured');
    }
    const client = getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: data,
        ...(contentType && { ContentType: contentType }),
      })
    );
    const publicUrl = `${PUBLIC_BASE.replace(/\/$/, '')}/${key}`;
    logger.debug({ key, bucket: BUCKET }, 'S3 putObject');
    return { fileKey: key, publicUrl };
  }

  async getSignedUrl(key: string, expiresIn = 604800): Promise<string> {
    // 604800 = 7 days
    const client = getClient();
    return awsGetSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
  }

  async get(key: string): Promise<Buffer | null> {
    if (!BUCKET) return null;
    const client = getClient();
    try {
      const resp = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      if (!resp.Body) return null;
      const stream = resp.Body as Readable;
      return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      logger.error({ err, key, bucket: BUCKET }, 'S3 getObject failed');
      throw err;
    }
  }
}

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../../../core/logger';

const DEFAULT_EXPIRY_SECONDS = 900;

export function getS3Client(): S3Client {
  const region = process.env.AWS_REGION || 'us-east-1';
  return new S3Client({ region });
}

export async function getPresignedUploadUrl(params: {
  bucket: string;
  key: string;
  contentType?: string;
  expiresIn?: number;
}): Promise<string> {
  const { bucket, key, contentType, expiresIn = DEFAULT_EXPIRY_SECONDS } = params;
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(contentType && { ContentType: contentType }),
  });
  try {
    const url = await getSignedUrl(client, command, { expiresIn });
    return url;
  } catch (err) {
    logger.error({ err, bucket, key }, 'Failed to generate presigned upload URL');
    throw err;
  }
}

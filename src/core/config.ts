import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000'), 
  MONGO_URI: z.string(),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
});

export const env = envSchema.parse(process.env);

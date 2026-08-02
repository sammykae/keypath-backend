import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  MONGO_URI: z.string(),

  GEMINI_API_KEY: z.string().optional(),

  ASK_AI_MIN_RELEVANCE: z.string().default('0.7'),

  JWT_SECRET: z.string().default('defaultsecret'),
  JWT_EXPIRES_IN: z.string().default('1d'),

  POLYGON_RPC: z.string().optional().default(''),
  BASE_RPC: z.string().optional().default(''),

  MIRROR_ENABLED: z.string().default('false'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),

  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),

  DEMO_MODE: z
    .string()
    .optional()
    .default('false')
    .transform(v => v === 'true'),

  BACKEND_URL: z.string().default('http://localhost:3000'),

  // Required to create admin accounts via POST /api/auth/admin/create.
  // If not set the endpoint returns 503. Set a strong secret in production.
  ADMIN_CREATION_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);

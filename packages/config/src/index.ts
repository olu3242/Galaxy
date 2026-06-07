import { z } from 'zod';

/**
 * Validated environment configuration.
 *
 * All env vars are parsed and validated at startup via Zod.
 * Import `env` from this module — never read process.env directly.
 *
 * Usage:
 *   import { env } from '@galaxy/config';
 *   const url = env.DATABASE_URL;
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  API_BASE_URL: z.string().url(),
  WEB_BASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_URL_TEST: z.string().url().optional(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  // Redis
  REDIS_URL: z.string(),
  REDIS_QUEUE_DB: z.coerce.number().default(0),
  REDIS_CACHE_DB: z.coerce.number().default(1),
  REDIS_SESSION_DB: z.coerce.number().default(2),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // WhatsApp
  WHATSAPP_APP_ID: z.string(),
  WHATSAPP_APP_SECRET: z.string(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string(),
  WHATSAPP_PHONE_NUMBER_ID: z.string(),
  WHATSAPP_ACCESS_TOKEN: z.string(),
  WHATSAPP_API_VERSION: z.string().default('v19.0'),

  // AI
  ANTHROPIC_API_KEY: z.string(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().default(4096),

  // Storage
  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2']).default('local'),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),

  // Monitoring
  SENTRY_DSN: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

  // Feature flags
  FEATURE_AGENT_OS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  FEATURE_KNOWLEDGE_OS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  FEATURE_LOOP_LEARNING: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  FEATURE_LOOP_OPTIMIZATION: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  FEATURE_ANALYTICS_ADVANCED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
});

const _parsed = envSchema.safeParse(process.env);

if (!_parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(_parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = _parsed.data;
export type Env = typeof env;

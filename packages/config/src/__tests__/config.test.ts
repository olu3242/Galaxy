/**
 * @galaxy/config — env schema validation unit tests
 *
 * Tests the Zod schema logic directly without importing the side-effectful
 * `env` singleton (which calls process.exit on validation failure).
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Mirror the schema from src/index.ts so we can test it in isolation.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  API_BASE_URL: z.string().url(),
  WEB_BASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  DATABASE_URL: z.string().url(),
  DATABASE_URL_TEST: z.string().url().optional(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  REDIS_URL: z.string(),
  REDIS_QUEUE_DB: z.coerce.number().default(0),
  REDIS_CACHE_DB: z.coerce.number().default(1),
  REDIS_SESSION_DB: z.coerce.number().default(2),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  WHATSAPP_APP_ID: z.string(),
  WHATSAPP_APP_SECRET: z.string(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string(),
  WHATSAPP_PHONE_NUMBER_ID: z.string(),
  WHATSAPP_ACCESS_TOKEN: z.string(),
  WHATSAPP_API_VERSION: z.string().default('v19.0'),

  ANTHROPIC_API_KEY: z.string(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().default(4096),

  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2']).default('local'),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),

  SENTRY_DSN: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

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

type RawEnv = Record<string, string | undefined>;

function minimalEnv(overrides: RawEnv = {}): RawEnv {
  return {
    API_BASE_URL: 'http://localhost:3001',
    WEB_BASE_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/galaxy',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'super-secret-value-that-is-at-least-32-chars',
    WHATSAPP_APP_ID: 'wa-app-id',
    WHATSAPP_APP_SECRET: 'wa-app-secret',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-token',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
    WHATSAPP_ACCESS_TOKEN: 'EAAtest',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    ...overrides,
  };
}

describe('envSchema — required fields', () => {
  it('parses a valid minimal env', () => {
    const result = envSchema.safeParse(minimalEnv());
    expect(result.success).toBe(true);
  });

  it('fails when API_BASE_URL is missing', () => {
    const result = envSchema.safeParse(minimalEnv({ API_BASE_URL: undefined }));
    expect(result.success).toBe(false);
  });

  it('fails when DATABASE_URL is missing', () => {
    const result = envSchema.safeParse(minimalEnv({ DATABASE_URL: undefined }));
    expect(result.success).toBe(false);
  });

  it('fails when REDIS_URL is missing', () => {
    const result = envSchema.safeParse(minimalEnv({ REDIS_URL: undefined }));
    expect(result.success).toBe(false);
  });

  it('fails when JWT_SECRET is shorter than 32 characters', () => {
    const result = envSchema.safeParse(minimalEnv({ JWT_SECRET: 'too-short' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.flatten().fieldErrors;
      expect(issues.JWT_SECRET).toBeDefined();
    }
  });

  it('fails when ANTHROPIC_API_KEY is missing', () => {
    const result = envSchema.safeParse(minimalEnv({ ANTHROPIC_API_KEY: undefined }));
    expect(result.success).toBe(false);
  });
});

describe('envSchema — defaults', () => {
  it('defaults NODE_ENV to development', () => {
    const result = envSchema.safeParse(minimalEnv());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.NODE_ENV).toBe('development');
  });

  it('defaults PORT to 3001', () => {
    const result = envSchema.safeParse(minimalEnv());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PORT).toBe(3001);
  });

  it('coerces PORT string to number', () => {
    const result = envSchema.safeParse(minimalEnv({ PORT: '4000' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PORT).toBe(4000);
  });

  it('defaults LOG_LEVEL to info', () => {
    const result = envSchema.safeParse(minimalEnv());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.LOG_LEVEL).toBe('info');
  });

  it('defaults WHATSAPP_API_VERSION to v19.0', () => {
    const result = envSchema.safeParse(minimalEnv());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.WHATSAPP_API_VERSION).toBe('v19.0');
  });

  it('defaults ANTHROPIC_MODEL', () => {
    const result = envSchema.safeParse(minimalEnv());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
  });

  it('defaults ANTHROPIC_MAX_TOKENS to 4096', () => {
    const result = envSchema.safeParse(minimalEnv());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ANTHROPIC_MAX_TOKENS).toBe(4096);
  });

  it('defaults STORAGE_PROVIDER to local', () => {
    const result = envSchema.safeParse(minimalEnv());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.STORAGE_PROVIDER).toBe('local');
  });

  it('defaults all feature flags to false', () => {
    const result = envSchema.safeParse(minimalEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.FEATURE_AGENT_OS).toBe(false);
      expect(result.data.FEATURE_KNOWLEDGE_OS).toBe(false);
      expect(result.data.FEATURE_LOOP_LEARNING).toBe(false);
      expect(result.data.FEATURE_LOOP_OPTIMIZATION).toBe(false);
      expect(result.data.FEATURE_ANALYTICS_ADVANCED).toBe(false);
    }
  });
});

describe('envSchema — NODE_ENV enum', () => {
  it('accepts production', () => {
    const result = envSchema.safeParse(minimalEnv({ NODE_ENV: 'production' }));
    expect(result.success).toBe(true);
  });

  it('accepts test', () => {
    const result = envSchema.safeParse(minimalEnv({ NODE_ENV: 'test' }));
    expect(result.success).toBe(true);
  });

  it('rejects unknown NODE_ENV values', () => {
    const result = envSchema.safeParse(minimalEnv({ NODE_ENV: 'staging' }));
    expect(result.success).toBe(false);
  });
});

describe('envSchema — LOG_LEVEL enum', () => {
  const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  for (const level of validLevels) {
    it(`accepts LOG_LEVEL=${level}`, () => {
      const result = envSchema.safeParse(minimalEnv({ LOG_LEVEL: level }));
      expect(result.success).toBe(true);
    });
  }

  it('rejects unknown log level', () => {
    const result = envSchema.safeParse(minimalEnv({ LOG_LEVEL: 'verbose' }));
    expect(result.success).toBe(false);
  });
});

describe('envSchema — URL validation', () => {
  it('fails when API_BASE_URL is not a valid URL', () => {
    const result = envSchema.safeParse(minimalEnv({ API_BASE_URL: 'not-a-url' }));
    expect(result.success).toBe(false);
  });

  it('fails when DATABASE_URL is not a valid URL', () => {
    const result = envSchema.safeParse(minimalEnv({ DATABASE_URL: 'invalid' }));
    expect(result.success).toBe(false);
  });
});

describe('envSchema — feature flags transform', () => {
  it('transforms FEATURE_AGENT_OS="true" to boolean true', () => {
    const result = envSchema.safeParse(minimalEnv({ FEATURE_AGENT_OS: 'true' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.FEATURE_AGENT_OS).toBe(true);
  });

  it('transforms FEATURE_AGENT_OS="false" to boolean false', () => {
    const result = envSchema.safeParse(minimalEnv({ FEATURE_AGENT_OS: 'false' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.FEATURE_AGENT_OS).toBe(false);
  });

  it('any non-"true" string is treated as false', () => {
    const result = envSchema.safeParse(minimalEnv({ FEATURE_KNOWLEDGE_OS: '1' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.FEATURE_KNOWLEDGE_OS).toBe(false);
  });
});

describe('envSchema — optional fields', () => {
  it('accepts missing optional S3 fields', () => {
    const result = envSchema.safeParse(minimalEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.S3_BUCKET).toBeUndefined();
      expect(result.data.SENTRY_DSN).toBeUndefined();
    }
  });

  it('accepts DATABASE_URL_TEST when provided', () => {
    const result = envSchema.safeParse(
      minimalEnv({ DATABASE_URL_TEST: 'postgresql://user:pass@localhost:5432/galaxy_test' }),
    );
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.DATABASE_URL_TEST).toBe(
        'postgresql://user:pass@localhost:5432/galaxy_test',
      );
  });

  it('STORAGE_PROVIDER accepts s3 and r2', () => {
    for (const provider of ['s3', 'r2'] as const) {
      const result = envSchema.safeParse(minimalEnv({ STORAGE_PROVIDER: provider }));
      expect(result.success).toBe(true);
    }
  });
});

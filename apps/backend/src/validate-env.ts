// Fails fast with a clear error instead of booting with a broken/insecure
// config (e.g. `JWT_SECRET!` silently becoming `undefined`, or CORS opening
// up to `*` because `FRONTEND_URL` is unset).
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'FRONTEND_URL',
] as const;

// Required only in production — convenient to omit locally/in CI.
const REQUIRED_IN_PRODUCTION = [
  'TELEGRAM_WEBHOOK_SECRET',
] as const;

// Ovoz (jonli dars) ixtiyoriy: uchchalasi ham bo'lsa yoqiladi, umuman
// bo'lmasa o'chiq. Qismi berilgan bo'lsa — bu deyarli har doim xato config.
const LIVEKIT_ENV_VARS = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const;

const INSECURE_DEFAULTS = new Set([
  'change_me',
  'change_me_to_a_long_random_string',
  'changeme123',
]);

export function validateEnv() {
  const missing: string[] = [];
  const insecure: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    const value = process.env[key];
    if (!value) missing.push(key);
    else if (INSECURE_DEFAULTS.has(value)) insecure.push(key);
  }

  if (process.env.NODE_ENV === 'production') {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) missing.push(key);
    }
  }

  const livekitSet = LIVEKIT_ENV_VARS.filter((key) => process.env[key]?.trim());
  if (livekitSet.length > 0 && livekitSet.length < LIVEKIT_ENV_VARS.length) {
    const livekitMissing = LIVEKIT_ENV_VARS.filter((key) => !process.env[key]?.trim());
    // eslint-disable-next-line no-console
    console.warn(
      `LiveKit config is incomplete (missing: ${livekitMissing.join(', ')}). ` +
        'Live classroom voice will stay disabled until all three are set.',
    );
  }

  if (missing.length > 0 || insecure.length > 0) {
    const lines: string[] = [];
    if (missing.length > 0) {
      lines.push(`Missing required environment variables: ${missing.join(', ')}`);
    }
    if (insecure.length > 0) {
      lines.push(`Environment variables still set to insecure default values: ${insecure.join(', ')}`);
    }
    lines.push('Refusing to start. Set these in your .env / deployment environment.');
    // eslint-disable-next-line no-console
    console.error(lines.join('\n'));
    process.exit(1);
  }
}

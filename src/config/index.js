// Central configuration. Other modules read settings from here instead of
// touching process.env directly, so every option is documented in one place.
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..', '..');

// Load .env when it exists. Node 20.12+ has this built in, so no dotenv needed.
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

function readPort(name, fallback) {
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a port number between 1 and 65535, got "${value}".`);
  }
  return port;
}

function readUrl(name) {
  const value = env[name];
  if (!value) return '';
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a full URL such as https://media.example.com, got "${value}".`);
  }
  return value.replace(/\/+$/, '');
}

function readSessionSecret() {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (isProduction) throw new Error('SESSION_SECRET must be set in production.');
  console.warn('[config] SESSION_SECRET is not set. Using an insecure development secret.');
  return 'dev-only-insecure-session-secret';
}

export const config = Object.freeze({
  env: env.NODE_ENV || 'development',
  isProduction,
  rootDir,
  appName: env.APP_NAME || 'StreamSite',
  port: readPort('PORT', 3000),
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/streamsite',
  sessionSecret: readSessionSecret(),
  trustProxy: env.TRUST_PROXY === 'true',
  media: Object.freeze({
    bind: env.MEDIA_BIND || '0.0.0.0',
    rtmpPort: readPort('RTMP_PORT', 1935),
    httpPort: readPort('MEDIA_HTTP_PORT', 8000),
    logLevel: env.MEDIA_LOG_LEVEL || 'warn',
    publicUrl: readUrl('MEDIA_PUBLIC_URL'),
    rtmpPublicUrl: readUrl('RTMP_PUBLIC_URL'),
  }),
});

import { randomBytes } from 'node:crypto';

export const production = process.env.NODE_ENV === 'production';
function setting(name, local) {
  const value = process.env[name] || (!production && local);
  if (!value) throw new Error('Missing setting ' + name);
  return value;
}
export const origin = new URL(setting('PUBLIC_ORIGIN', 'http://127.0.0.1:4320')).origin;
export const redisUrl = setting('REDIS_URL', 'redis://127.0.0.1:56389');
export const issuer = production
  ? 'https://accounts.google.com'
  : setting('LOCAL_OIDC_ORIGIN', 'http://127.0.0.1:4323');
export const oidcClientId = setting('OIDC_CLIENT_ID', 'penicillion-local');
export const oidcSecret = setting('OIDC_CLIENT_SECRET', 'local-test-client-secret');
export const cookieName = production ? '__Host-night-culture' : 'night_culture_session';
export const redisPrefix = process.env.CACHE_NAMESPACE || 'penicillion:';
export const keyMaterial = setting(
  'SESSION_SECRET',
  'development-only-local-game-key-change-in-production',
);
if (production) {
  if (
    !origin.startsWith('https://') ||
    !redisUrl.startsWith('rediss://') ||
    ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname) ||
    process.env.LOCAL_OIDC_ORIGIN ||
    (process.env.OIDC_ISSUER && process.env.OIDC_ISSUER !== issuer) ||
    keyMaterial.length < 32 ||
    /local-test|development-only|local-game/.test([oidcSecret, keyMaterial].join(' '))
  ) {
    throw new Error('Production requires TLS, Google OIDC, and independent production secrets.');
  }
} else if (
  ![origin, issuer].every((url) => ['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
) {
  throw new Error('Local game origins must be loopback.');
}
export const nonce = () => randomBytes(24).toString('base64url');

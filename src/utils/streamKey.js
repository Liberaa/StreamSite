import crypto from 'node:crypto';

/** A new random stream key, like "sk_3hV9...". Treat it like a password. */
export function generateStreamKey() {
  return `sk_${crypto.randomBytes(18).toString('base64url')}`;
}

/**
 * What the creator pastes into the "Stream Key" field in OBS.
 * The part before "?" is the public stream name, so viewers watch
 * /live/<username>.flv and never see the secret part.
 */
export function obsStreamKey(username, streamKey) {
  return `${username}?key=${streamKey}`;
}

/** Compares keys in constant time, so response timing cannot leak the key. */
export function streamKeysMatch(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

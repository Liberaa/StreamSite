/** True for our fetch() calls that ask for JSON, false for normal page loads. */
export function wantsJson(req) {
  return req.accepts(['html', 'json']) === 'json';
}

/**
 * Only allows redirects to paths on this site, such as "/lukas".
 * Blocks "//evil.com", backslashes (\x5c) and control characters,
 * which browsers may turn into a redirect to another site.
 */
export function safeRedirectPath(value, fallback = '/') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback;
  if (/[\x5c\p{Cc}]/u.test(value)) return fallback;
  return value;
}

/** True when an Origin header points at the same host the request was sent to. */
export function originMatchesHost(origin, host) {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

import helmet from 'helmet';
import { config } from '../config/index.js';
import { externalMediaOrigin } from '../services/mediaUrls.js';
import { originMatchesHost } from '../utils/http.js';
import { renderError } from './errors.js';

/** Security headers, including a Content Security Policy that fits the video player. */
export function securityHeaders() {
  const videoOrigin = externalMediaOrigin();
  return helmet({
    contentSecurityPolicy: {
      directives: {
        // Video comes from this site (relayed), or from MEDIA_PUBLIC_URL when that is set.
        connectSrc: ["'self'", ...(videoOrigin ? [videoOrigin] : [])],
        // mpegts.js plays video through a blob: URL (Media Source Extensions).
        mediaSrc: ["'self'", 'blob:'],
        imgSrc: ["'self'", 'data:'],
        // In development everything is plain http, so do not force https.
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    // In development, HSTS would make browsers insist on https for localhost.
    strictTransportSecurity: config.isProduction,
    // "same-origin" keeps the Origin header on our own form posts, which the
    // CSRF check below needs in browsers that do not send Sec-Fetch-Site.
    // ("no-referrer" would turn it into "null".) Other sites get no referrer.
    referrerPolicy: { policy: 'same-origin' },
  });
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection without tokens: rejects form posts and fetches that another
 * website triggers in the user's browser. Modern browsers send Sec-Fetch-Site
 * with every request; for older ones the Origin header is compared instead.
 */
export function crossOriginProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite) {
    if (fetchSite === 'same-origin' || fetchSite === 'none') return next();
    return renderError(req, res, 403, 'That request came from another website, so it was blocked.');
  }

  const origin = req.get('origin');
  if (!origin || originMatchesHost(origin, req.get('host'))) return next();
  return renderError(req, res, 403, 'That request came from another website, so it was blocked.');
}

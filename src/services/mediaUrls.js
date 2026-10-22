import { config } from '../config/index.js';
import { isLocalHostname, lanAddresses } from '../utils/network.js';

// The RTMP "application" name: OBS streams to rtmp://<host>/live.
export const STREAM_APP = 'live';

/**
 * Where the browser player loads a channel's live video. By default the
 * website relays it (routes/playback.routes.js), so it works on https pages
 * and behind proxies. MEDIA_PUBLIC_URL points players at a media server or CDN instead.
 */
export function playbackUrl(username) {
  const base = config.media.publicUrl || '';
  return `${base}/${STREAM_APP}/${username}.flv`;
}

/** Extra origin the security policy must allow for video, or null when video is same-origin. */
export function externalMediaOrigin() {
  return config.media.publicUrl ? new URL(config.media.publicUrl).origin : null;
}

/** The "Server" value creators paste into OBS. */
export function ingestUrl(req) {
  if (config.media.rtmpPublicUrl) return config.media.rtmpPublicUrl;
  return rtmpUrlFor(req.hostname || 'localhost');
}

/**
 * Server value for a phone app such as Larix Broadcaster. Same as ingestUrl,
 * except "localhost" is swapped for this computer's Wi-Fi address, because
 * on a phone "localhost" means the phone itself.
 */
export function phoneIngestUrl(req) {
  const [lanAddress] = lanAddresses();
  if (config.media.rtmpPublicUrl || !isLocalHostname(req.hostname) || !lanAddress) return ingestUrl(req);
  return rtmpUrlFor(lanAddress);
}

/** In development: the https address a phone on the same Wi-Fi can open. */
export function phoneSiteUrl() {
  const [lanAddress] = lanAddresses();
  if (!config.devHttpsPort || !lanAddress) return null;
  return `https://${lanAddress}:${config.devHttpsPort}`;
}

function rtmpUrlFor(host) {
  const port = config.media.rtmpPort === 1935 ? '' : `:${config.media.rtmpPort}`;
  return `rtmp://${host}${port}/${STREAM_APP}`;
}

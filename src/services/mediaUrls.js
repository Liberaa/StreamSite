import { config } from '../config/index.js';

// The RTMP "application" name: OBS streams to rtmp://<host>/live.
export const STREAM_APP = 'live';

/** Origin of the media server as the viewer's browser sees it, e.g. http://localhost:8000 */
export function mediaOrigin(req) {
  if (config.media.publicUrl) return new URL(config.media.publicUrl).origin;
  return `http://${req.hostname || 'localhost'}:${config.media.httpPort}`;
}

/** Where the browser player loads a channel's live video (HTTP-FLV). */
export function playbackUrl(req, username) {
  const base = config.media.publicUrl || mediaOrigin(req);
  return `${base}/${STREAM_APP}/${username}.flv`;
}

/** The "Server" value creators paste into OBS. */
export function ingestUrl(req) {
  if (config.media.rtmpPublicUrl) return config.media.rtmpPublicUrl;
  const port = config.media.rtmpPort === 1935 ? '' : `:${config.media.rtmpPort}`;
  return `rtmp://${req.hostname || 'localhost'}${port}/${STREAM_APP}`;
}

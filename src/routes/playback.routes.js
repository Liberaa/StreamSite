import http from 'node:http';
import { Router } from 'express';
import { config } from '../config/index.js';
import { USERNAME_PATTERN } from '../models/User.js';
import { STREAM_APP } from '../services/mediaUrls.js';

// Live video goes through the website: GET /live/<username>.flv is relayed
// from the media server. Same-origin video works on https pages, behind a
// reverse proxy and through tunnels, so only the web port has to be public.
const router = Router();
const mediaHost = ['0.0.0.0', '::', ''].includes(config.media.bind) ? '127.0.0.1' : config.media.bind;

router.get(`/${STREAM_APP}/:file`, (req, res, next) => {
  const { file } = req.params;
  const username = file.endsWith('.flv') ? file.slice(0, -4) : '';
  if (!USERNAME_PATTERN.test(username)) return next();

  const upstream = http.get(
    { host: mediaHost, port: config.media.httpPort, path: `/${STREAM_APP}/${username}.flv`, agent: false },
    (media) => {
      if (media.statusCode !== 200) {
        media.resume();
        return res.sendStatus(502);
      }
      res.writeHead(200, { 'Content-Type': 'video/x-flv', 'Cache-Control': 'no-store' });
      media.pipe(res);
    },
  );
  upstream.on('error', () => (res.headersSent ? res.destroy() : res.sendStatus(502)));
  // The viewer closed the page: stop pulling video for them.
  res.on('close', () => upstream.destroy());
});

export default router;

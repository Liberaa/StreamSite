import { spawn } from 'node:child_process';
import { Server } from 'socket.io';
import { config } from '../config/index.js';
import { User } from '../models/User.js';
import { ffmpegPath } from '../services/ffmpeg.js';
import { createPublishToken, endStream } from '../services/mediaServer.js';
import { STREAM_APP } from '../services/mediaUrls.js';
import { originMatchesHost } from '../utils/http.js';
import { attachToServers } from './attach.js';

const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_PENDING_BYTES = 16 * 1024 * 1024;
const STOP_TIMEOUT_MS = 5000;
const QUALITY = {
  hd: { videoBitrate: '2500k', bufferSize: '5000k' },
  sd: { videoBitrate: '1000k', bufferSize: '2000k' },
};

/** Browser broadcasts that are running, by username. One per creator. */
const broadcasts = new Map();
const starting = new Set();

/**
 * Streaming straight from the browser, for example a phone camera. The page
 * (public/js/broadcast.js) records camera and microphone with MediaRecorder
 * and sends half-second chunks here. ffmpeg turns them into a normal RTMP
 * stream for the media server, so viewers, chat and live status work exactly
 * like they do with OBS.
 *
 *   'broadcast:start' { quality }   -> ack { ok, error }
 *   'broadcast:chunk' <binary>      -> ack { ok, error }   (send the next one after the ack)
 *   'broadcast:stop'                -> ack { ok }
 *   server -> page: 'broadcast:error' message, 'broadcast:replaced'
 */
export function createIngestServer(servers, sessionMiddleware) {
  const io = new Server({
    path: '/ingest.io',
    serveClient: false,
    maxHttpBufferSize: MAX_CHUNK_BYTES,
    // Checked before a connection is accepted: from this site, and logged in.
    allowRequest: (req, callback) => {
      const { origin, host } = req.headers;
      if (origin && !originMatchesHost(origin, host)) return callback(null, false);
      sessionMiddleware(req, {}, (error) => callback(null, !error && Boolean(req.session?.userId)));
    },
  });
  attachToServers(io, servers);

  io.use(async (socket, next) => {
    try {
      const user = await User.findById(socket.request.session?.userId).select('username').lean();
      if (!user) return next(new Error('Log in to go live.'));
      socket.data.username = user.username;
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on('connection', (socket) => {
    socket.on('broadcast:start', async (options, ack) => {
      reply(ack, await startBroadcast(socket, options).catch((error) => {
        console.error('[ingest] Could not start a browser stream:', error);
        return { ok: false, error: 'Could not start the stream. Please try again.' };
      }));
    });
    socket.on('broadcast:chunk', (chunk, ack) => writeChunk(socket, chunk, ack));
    socket.on('broadcast:stop', (ack) => {
      const broadcast = broadcasts.get(socket.data.username);
      if (broadcast?.socket === socket) stopBroadcast(broadcast, { endNow: true });
      reply(ack, { ok: true });
    });
    // A dropped connection keeps the stream open for 30 seconds, so a phone
    // that loses signal for a moment can reconnect without viewers noticing.
    socket.on('disconnect', () => {
      const broadcast = broadcasts.get(socket.data.username);
      if (broadcast?.socket === socket) stopBroadcast(broadcast, { endNow: false });
    });
  });

  return io;
}

/** Stops every browser stream, e.g. when the server shuts down. */
export function stopAllBroadcasts() {
  for (const broadcast of broadcasts.values()) broadcast.ffmpeg.kill('SIGKILL');
}

async function startBroadcast(socket, options) {
  const { username } = socket.data;
  if (!ffmpegPath) {
    return { ok: false, error: 'Browser streaming is turned off on this server because ffmpeg is missing.' };
  }
  if (starting.has(username)) return { ok: false, error: 'Already starting your stream.' };
  starting.add(username);
  try {
    // A reconnect from the same page, or going live from another device:
    // the old ffmpeg must be gone before the new one can publish.
    const previous = broadcasts.get(username);
    if (previous) {
      if (previous.socket !== socket) previous.socket.emit('broadcast:replaced');
      await stopBroadcast(previous, { endNow: false });
    }
    if (broadcasts.size >= config.browserStreamLimit) {
      return { ok: false, error: 'The server is busy with other browser streams. Try again soon, or use OBS or a phone app.' };
    }
    const quality = QUALITY[options?.quality] ?? QUALITY.hd;
    broadcasts.set(username, launchFfmpeg(socket, quality));
    console.log(`[ingest] ${username} is streaming from the browser`);
    return { ok: true };
  } finally {
    starting.delete(username);
  }
}

function launchFfmpeg(socket, quality) {
  const { username } = socket.data;
  const target = `rtmp://127.0.0.1:${config.media.rtmpPort}/${STREAM_APP}/${username}?token=${createPublishToken(username)}`;
  const ffmpeg = spawn(ffmpegPath, ffmpegArgs(quality, target), { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  const broadcast = { socket, ffmpeg, stopping: false, pendingBytes: 0, lastErrors: [] };

  broadcast.exited = new Promise((resolve) => {
    ffmpeg.once('exit', resolve);
    ffmpeg.once('error', resolve);
  });
  ffmpeg.stdin.on('error', () => {}); // ffmpeg exited; handled when the process ends.
  ffmpeg.stderr.setEncoding('utf8');
  ffmpeg.stderr.on('data', (text) => {
    broadcast.lastErrors.push(...text.split(/\r?\n/).filter(Boolean));
    broadcast.lastErrors.splice(0, broadcast.lastErrors.length - 5);
  });
  broadcast.exited.then((result) => {
    clearTimeout(broadcast.killTimer);
    if (broadcasts.get(username) === broadcast) broadcasts.delete(username);
    if (broadcast.stopping) return;
    // ffmpeg stopped on its own: tell the page why.
    const detail = result instanceof Error ? result.message : broadcast.lastErrors.join(' | ');
    console.warn(`[ingest] Browser stream for ${username} stopped: ${detail || `exit code ${result}`}`);
    socket.emit('broadcast:error', 'Your stream stopped. If you are already live from OBS or a phone app, end that stream first.');
  });
  return broadcast;
}

function ffmpegArgs({ videoBitrate, bufferSize }, target) {
  return [
    '-hide_banner', '-loglevel', 'error',
    // Input: the WebM or MP4 that MediaRecorder produces. Reading it at real-time
    // speed (-re) smooths out MP4, which browsers deliver in bursts of whole fragments.
    '-fflags', '+genpts', '-re', '-i', 'pipe:0',
    '-map', '0:v:0', '-map', '0:a:0?',
    // Video: H.264 with a keyframe every 2 seconds, so new viewers start quickly.
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-r', '30', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-b:v', videoBitrate, '-maxrate', videoBitrate, '-bufsize', bufferSize,
    // Audio: AAC, which every player supports.
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    '-f', 'flv', '-flvflags', 'no_duration_filesize', target,
  ];
}

function writeChunk(socket, chunk, ack) {
  const broadcast = broadcasts.get(socket.data.username);
  if (!broadcast || broadcast.socket !== socket || broadcast.stopping) {
    return reply(ack, { ok: false, error: 'You are not live right now.' });
  }
  if (!Buffer.isBuffer(chunk)) return reply(ack, { ok: false, error: 'That was not video data.' });
  if (broadcast.pendingBytes > MAX_PENDING_BYTES) {
    stopBroadcast(broadcast, { endNow: true });
    socket.emit('broadcast:error', 'The server could not keep up with your stream, so it was stopped.');
    return reply(ack, { ok: false, error: 'The server could not keep up.' });
  }
  broadcast.pendingBytes += chunk.length;
  broadcast.ffmpeg.stdin.write(chunk, (error) => {
    broadcast.pendingBytes -= chunk.length;
    reply(ack, error ? { ok: false, error: 'Your stream stopped.' } : { ok: true });
  });
}

/**
 * Lets ffmpeg finish and exit. With endNow the channel goes offline at once
 * (the creator pressed "End stream"); otherwise the usual 30 second reconnect
 * window applies. Resolves when ffmpeg has exited.
 */
function stopBroadcast(broadcast, { endNow }) {
  if (!broadcast.stopping) {
    broadcast.stopping = true;
    broadcast.ffmpeg.stdin.end();
    broadcast.killTimer = setTimeout(() => broadcast.ffmpeg.kill('SIGKILL'), STOP_TIMEOUT_MS);
    if (endNow) endStream(broadcast.socket.data.username);
  }
  return broadcast.exited;
}

function reply(ack, value) {
  if (typeof ack === 'function') ack(value);
}

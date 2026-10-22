import path from 'node:path';
import NodeMediaServer from 'node-media-server';
import nmsLogger from 'node-media-server/src/core/logger.js';
import { config } from '../config/index.js';
import { User, USERNAME_PATTERN } from '../models/User.js';
import { streamKeysMatch } from '../utils/streamKey.js';
import { STREAM_APP } from './mediaUrls.js';
import { streamEvents, streamSummary } from './streamEvents.js';

/**
 * Publishers that passed the stream key check, by media server session id.
 * node-media-server allows one publisher per stream path, so there is at most
 * one entry per username.
 * @type {Map<string, { username: string, session: { close: () => void } }>}
 */
const publishers = new Map();

/** One queue per channel, so database updates for a channel never overlap. */
const syncQueues = new Map();

/**
 * Starts the RTMP ingest server (OBS connects here) and the HTTP-FLV server
 * (browsers watch here). Returns the node-media-server instance.
 */
export async function startMediaServer() {
  // Nobody is streaming yet, whatever the database says after a crash or restart.
  await User.updateMany({ 'stream.isLive': true }, { $set: { 'stream.isLive': false, 'stream.startedAt': null } });

  const nms = new NodeMediaServer({
    bind: config.media.bind,
    rtmp: { port: config.media.rtmpPort },
    http: { port: config.media.httpPort },
    webadmin: { enable: false }, // The bundled admin console is not needed and would be public.
    store: { path: path.join(config.rootDir, 'storage', 'media-server') },
  });
  guardMediaHttpServer(nms.httpServer?.httpServer); // Works around a crash bug, see below.
  // node-media-server switches to debug logging in its constructor.
  nmsLogger.level = config.media.logLevel;

  // node-media-server emits prePublish synchronously and does not wait for
  // listeners, so the key check runs async and closes the connection as soon
  // as the key turns out to be wrong.
  nms.on('prePublish', (session) => {
    authorizePublisher(session).catch((error) => {
      console.error('[media] Stream key check failed:', error);
      session.close();
    });
  });

  // Fired when a stream really ends. node-media-server waits 30 seconds after
  // OBS disconnects, so a creator whose connection drops can resume seamlessly.
  nms.on('donePublish', (session) => {
    const publisher = publishers.get(session.id);
    if (!publisher) return; // A connection we rejected.
    publishers.delete(session.id);
    syncLiveState(publisher.username);
  });

  // Resetting a stream key ends any stream that still uses the old key.
  streamEvents.on('keyRevoked', ({ username }) => {
    for (const [id, publisher] of publishers) {
      if (publisher.username !== username) continue;
      publishers.delete(id);
      publisher.session.close();
    }
    syncLiveState(username);
  });

  await nms.run();
  console.log(
    `[media] OBS ingest on rtmp://localhost:${config.media.rtmpPort}/${STREAM_APP}, ` +
      `playback on http://localhost:${config.media.httpPort}`,
  );
  return nms;
}

// node-media-server 4.4.x crashes the whole process when an HTTP or WebSocket
// request names a stream with characters it does not allow, for example
// GET /live/a%20b.flv. Only well-formed /<app>/<name>.flv paths get through.
const VALID_MEDIA_PATH = /^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.flv$/;

function guardMediaHttpServer(server) {
  if (!server) {
    console.warn('[media] Could not install the media path guard; check the node-media-server version.');
    return;
  }
  for (const event of ['request', 'upgrade']) {
    const listeners = server.listeners(event);
    server.removeAllListeners(event);
    server.on(event, (req, resOrSocket, head) => {
      const urlPath = (req.url ?? '').split('?')[0];
      if (VALID_MEDIA_PATH.test(urlPath)) {
        for (const listener of listeners) listener.call(server, req, resOrSocket, head);
      } else if (event === 'request') {
        resOrSocket.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      } else {
        resOrSocket.destroy();
      }
    });
  }
}

async function authorizePublisher(session) {
  // OBS sends the "Stream Key" field as the stream name: "<username>?key=<secret>".
  const username = session.streamName;
  const key = session.streamQuery?.key;
  const validPath =
    session.streamApp === STREAM_APP && typeof username === 'string' && USERNAME_PATTERN.test(username);
  if (!validPath || typeof key !== 'string') {
    return reject(session, `expected rtmp://<host>/${STREAM_APP} with a stream key like "<username>?key=<secret>"`);
  }

  const user = await User.findOne({ username }).select('+streamKey').lean();
  if (!user || !streamKeysMatch(user.streamKey, key)) {
    return reject(session, 'wrong stream key');
  }

  // node-media-server may have refused or lost the connection while we were
  // checking, for example because this channel already has a publisher.
  if (!session.isPublisher || session.endTime) return;

  // A reconnect within the 30 second grace window replaces the old session.
  for (const [id, publisher] of publishers) {
    if (publisher.username === username) publishers.delete(id);
  }
  publishers.set(session.id, { username, session });
  await syncLiveState(username);
}

function reject(session, reason) {
  console.warn(`[media] Rejected stream to "${session.streamPath || '(unknown)'}" from ${session.ip}: ${reason}`);
  session.close();
}

/**
 * Saves whether a channel is live, based on the publishers above, and tells
 * the rest of the app. Calls are queued per channel, so the final state is
 * right no matter in which order connects and disconnects arrive.
 */
function syncLiveState(username) {
  const previous = syncQueues.get(username) ?? Promise.resolve();
  const current = previous
    .then(() => writeLiveState(username))
    .catch((error) => console.error(`[media] Could not update live status for ${username}:`, error));
  syncQueues.set(username, current);
  current.then(() => {
    if (syncQueues.get(username) === current) syncQueues.delete(username);
  });
  return current;
}

async function writeLiveState(username) {
  const isLive = [...publishers.values()].some((publisher) => publisher.username === username);
  const user = await User.findOne({ username }).select('stream').lean();
  if (!user || user.stream.isLive === isLive) return;

  const now = new Date();
  if (isLive) {
    await User.updateOne(
      { _id: user._id },
      { $set: { 'stream.isLive': true, 'stream.startedAt': now, 'stream.lastLiveAt': now } },
    );
    console.log(`[media] ${username} is live`);
    streamEvents.emit('live', streamSummary(username, { ...user.stream, isLive: true, startedAt: now }));
  } else {
    await User.updateOne(
      { _id: user._id },
      { $set: { 'stream.isLive': false, 'stream.startedAt': null, 'stream.lastLiveAt': now } },
    );
    console.log(`[media] ${username} went offline`);
    streamEvents.emit('offline', { username });
  }
}

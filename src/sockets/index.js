import { Server } from 'socket.io';
import { User, USERNAME_PATTERN } from '../models/User.js';
import { setViewerCount } from '../services/presence.js';
import { streamEvents, streamSummary } from '../services/streamEvents.js';
import { originMatchesHost } from '../utils/http.js';
import { attachToServers } from './attach.js';
import { registerChatHandlers } from './chat.js';
import { channelRooms, chatRoom, statusRoom } from './rooms.js';

const VIEWER_COUNT_DELAY_MS = 1000;
const pendingViewerCounts = new Map();

/**
 * Real-time layer: chat, viewer counts and live/offline updates.
 * Browsers connect with io({ auth: { channel: '<username>' } }).
 */
export function createSocketServer(servers, sessionMiddleware) {
  const io = new Server({
    serveClient: false, // The browser script is a static file: /vendor/socket.io/
    maxHttpBufferSize: 10_000,
    // Only pages from this site may connect (blocks cross-site WebSocket hijacking).
    allowRequest: (req, callback) => {
      const { origin, host } = req.headers;
      callback(null, !origin || originMatchesHost(origin, host));
    },
  });
  attachToServers(io, servers);

  // Reuse the Express session, so sockets know who is logged in.
  io.engine.use(sessionMiddleware);

  io.use(async (socket, next) => {
    try {
      const { channel, mode } = socket.handshake.auth ?? {};
      const validName = typeof channel === 'string' && USERNAME_PATTERN.test(channel);
      if (!validName || !(await User.exists({ username: channel }))) {
        return next(new Error('Unknown channel'));
      }
      socket.data.channel = channel;
      socket.data.mode = mode === 'status' ? 'status' : 'viewer';
      socket.data.user = await loadChatUser(socket.request.session?.userId);
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on('connection', async (socket) => {
    const { channel, mode } = socket.data;

    if (mode === 'status') {
      socket.join(statusRoom(channel));
      socket.emit('viewers', countViewers(io, channel));
    } else {
      socket.join(chatRoom(channel));
      registerChatHandlers(io, socket);
      socket.on('disconnect', () => scheduleViewerCount(io, channel));
      scheduleViewerCount(io, channel);
    }

    // Sent after joining the room, so no live/offline event can slip in between.
    try {
      const creator = await User.findOne({ username: channel }).select('stream').lean();
      if (creator) socket.emit('stream:state', streamSummary(channel, creator.stream));
    } catch (error) {
      console.error('[sockets] Could not load stream state:', error);
    }
  });

  // Forward stream lifecycle events to everyone on that channel.
  streamEvents.on('live', (stream) => io.to(channelRooms(stream.username)).emit('stream:live', stream));
  streamEvents.on('offline', ({ username }) => io.to(channelRooms(username)).emit('stream:offline'));
  streamEvents.on('info', (stream) => io.to(channelRooms(stream.username)).emit('stream:info', stream));

  return io;
}

async function loadChatUser(userId) {
  if (!userId) return null;
  const user = await User.findById(userId).select('username displayName accentColor').lean();
  if (!user) return null;
  return { username: user.username, displayName: user.displayName, color: user.accentColor };
}

function countViewers(io, channel) {
  return io.of('/').adapter.rooms.get(chatRoom(channel))?.size ?? 0;
}

// Joins and leaves are batched: 500 viewers arriving at once send one update, not 500.
function scheduleViewerCount(io, channel) {
  if (pendingViewerCounts.has(channel)) return;
  const timer = setTimeout(() => {
    pendingViewerCounts.delete(channel);
    const count = countViewers(io, channel);
    setViewerCount(channel, count);
    io.to(channelRooms(channel)).emit('viewers', count);
  }, VIEWER_COUNT_DELAY_MS);
  pendingViewerCounts.set(channel, timer);
}

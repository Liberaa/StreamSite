import { EventEmitter } from 'node:events';
import { categoryName } from '../config/categories.js';

/**
 * In-process event bus for stream lifecycle events. The media server, the chat
 * sockets and future features (notifications, webhooks, analytics) talk through
 * it instead of importing each other.
 *
 *   'live'        streamSummary()   a channel went live
 *   'offline'     { username }      a channel stopped streaming
 *   'info'        streamSummary()   stream title or category changed
 *   'keyRevoked'  { username }      a creator reset their stream key
 */
export const streamEvents = new EventEmitter();

/** The public description of a channel's stream, as sent to browsers. */
export function streamSummary(username, stream) {
  return {
    username,
    isLive: Boolean(stream.isLive),
    title: stream.title ?? '',
    category: stream.category,
    categoryName: categoryName(stream.category),
    startedAt: stream.startedAt ? new Date(stream.startedAt).toISOString() : null,
  };
}

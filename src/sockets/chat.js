import crypto from 'node:crypto';
import { chatRoom } from './rooms.js';

const MAX_MESSAGE_LENGTH = 300;
const COOLDOWN_MS = 1000;
// Control characters and invisible text-direction overrides can garble the chat.
const UNSAFE_CHARACTERS = /[\p{Cc}\p{Bidi_Control}]/gu;

/**
 * Chat for one connected viewer. Messages are not stored yet: viewers only
 * see what is sent while they have the page open.
 */
export function registerChatHandlers(io, socket) {
  socket.on('chat:send', (text, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const { user, channel } = socket.data;
    if (!user) return reply({ ok: false, error: 'Log in to chat.' });

    const message = typeof text === 'string' ? text.replace(UNSAFE_CHARACTERS, '').trim() : '';
    if (!message) return reply({ ok: false, error: 'Type a message first.' });
    if (message.length > MAX_MESSAGE_LENGTH) {
      return reply({ ok: false, error: `Keep messages under ${MAX_MESSAGE_LENGTH} characters.` });
    }

    const now = Date.now();
    if (now - (socket.data.lastMessageAt ?? 0) < COOLDOWN_MS) {
      return reply({ ok: false, error: 'Slow down a little.' });
    }
    socket.data.lastMessageAt = now;

    io.to(chatRoom(channel)).emit('chat:message', {
      id: crypto.randomUUID(),
      text: message,
      sentAt: now,
      author: { ...user, isCreator: user.username === channel },
    });
    reply({ ok: true });
  });
}

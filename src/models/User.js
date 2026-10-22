import mongoose from 'mongoose';
import { CATEGORY_IDS, DEFAULT_CATEGORY } from '../config/categories.js';

// Every account is also a channel: the username is the channel URL (/:username)
// and the public stream name. Lowercase letters, numbers and underscores only.
export const USERNAME_PATTERN = /^[a-z0-9_]{3,25}$/;
export const MAX_LINKS = 3;
export const DEFAULT_ACCENT = '#8b5cf6';

// Usernames double as top-level URLs, so they must not collide with site routes.
const RESERVED_USERNAMES = new Set([
  'about', 'admin', 'api', 'browse', 'categories', 'creators', 'css', 'dashboard',
  'directory', 'following', 'help', 'images', 'js', 'live', 'login', 'logout',
  'moderator', 'null', 'privacy', 'register', 'root', 'search', 'settings', 'signup',
  'staff', 'static', 'support', 'system', 'terms', 'undefined', 'vendor',
]);

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const linkSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true, maxlength: [30, 'Link labels can be at most 30 characters.'] },
    url: {
      type: String,
      trim: true,
      required: true,
      maxlength: [300, 'Links can be at most 300 characters.'],
      validate: { validator: isHttpUrl, message: 'Links must be web addresses, like https://youtube.com/@you.' },
    },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Pick a username.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [USERNAME_PATTERN, 'Usernames need 3 to 25 characters: letters, numbers and underscores.'],
      validate: { validator: (value) => !RESERVED_USERNAMES.has(value), message: 'That username is reserved.' },
    },
    displayName: {
      type: String,
      required: [true, 'Pick a display name.'],
      trim: true,
      maxlength: [40, 'Display names can be at most 40 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Enter your email address.'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, 'That email address is too long.'],
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.'],
    },
    // Secrets are never loaded unless a query asks for them with .select('+field').
    passwordHash: { type: String, required: true, select: false },
    streamKey: { type: String, required: true, select: false },

    // Creator profile
    bio: { type: String, trim: true, default: '', maxlength: [500, 'Your bio can be at most 500 characters.'] },
    accentColor: {
      type: String,
      default: DEFAULT_ACCENT,
      lowercase: true,
      match: [/^#[0-9a-f]{6}$/, 'Pick a valid channel color.'],
    },
    links: {
      type: [linkSchema],
      default: [],
      validate: { validator: (links) => links.length <= MAX_LINKS, message: `You can add up to ${MAX_LINKS} links.` },
    },
    followerCount: { type: Number, default: 0, min: 0 },

    // Current stream. isLive and startedAt are managed by the media server.
    stream: {
      title: { type: String, trim: true, default: '', maxlength: [140, 'Stream titles can be at most 140 characters.'] },
      category: {
        type: String,
        default: DEFAULT_CATEGORY,
        enum: { values: CATEGORY_IDS, message: 'Pick a category from the list.' },
      },
      isLive: { type: Boolean, default: false },
      startedAt: { type: Date, default: null },
      lastLiveAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

userSchema.index({ 'stream.isLive': 1, followerCount: -1 });

export const User = mongoose.model('User', userSchema);

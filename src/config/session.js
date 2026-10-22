import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { config } from './index.js';

export const SESSION_COOKIE = 'sid';
const TWO_WEEKS_IN_SECONDS = 14 * 24 * 60 * 60;

// Sessions are stored in MongoDB so logins survive server restarts.
// Call this after connectDatabase(): the store reuses Mongoose's connection.
export function createSessionMiddleware() {
  return session({
    name: SESSION_COOKIE,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      client: mongoose.connection.getClient(),
      collectionName: 'sessions',
      ttl: TWO_WEEKS_IN_SECONDS,
      touchAfter: 24 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction, // Production must run on HTTPS.
      maxAge: TWO_WEEKS_IN_SECONDS * 1000,
    },
  });
}

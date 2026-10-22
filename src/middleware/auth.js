import { User } from '../models/User.js';
import { wantsJson } from '../utils/http.js';

/** Loads the logged-in user (if any) into req.user and res.locals.currentUser. */
export async function loadCurrentUser(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return next();

  const user = await User.findById(userId).select('username displayName accentColor stream.isLive').lean();
  if (!user) {
    delete req.session.userId; // The account no longer exists.
    return next();
  }
  req.user = user;
  res.locals.currentUser = user;
  next();
}

export function requireAuth(req, res, next) {
  if (req.user) return next();
  if (wantsJson(req)) return res.status(401).json({ error: 'Log in first.' });
  const back = req.method === 'GET' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
  res.redirect(`/login${back}`);
}

export function requireGuest(req, res, next) {
  if (!req.user) return next();
  res.redirect('/dashboard');
}

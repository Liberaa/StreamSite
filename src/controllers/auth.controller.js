import bcrypt from 'bcryptjs';
import { SESSION_COOKIE } from '../config/session.js';
import { setFlash } from '../middleware/flash.js';
import { User } from '../models/User.js';
import { firstValidationMessage, formText } from '../utils/forms.js';
import { safeRedirectPath } from '../utils/http.js';
import { generateStreamKey } from '../utils/streamKey.js';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything after 72 bytes.

// Failed logins for unknown users still run bcrypt, so the response time
// does not reveal which usernames exist.
let dummyHashPromise;
function dummyHash() {
  dummyHashPromise ??= bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS);
  return dummyHashPromise;
}

export function showLogin(req, res) {
  res.render('pages/login', {
    title: 'Log in',
    error: null,
    values: {},
    redirectTo: safeRedirectPath(req.query.next, ''),
  });
}

export async function login(req, res) {
  const body = req.body ?? {};
  const identifier = formText(body.identifier).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const redirectTo = safeRedirectPath(body.redirectTo, '');

  const query = identifier.includes('@') ? { email: identifier } : { username: identifier };
  const user = identifier ? await User.findOne(query).select('+passwordHash') : null;
  const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : await dummyHash());

  if (!user || !passwordMatches) {
    return res.status(401).render('pages/login', {
      title: 'Log in',
      error: 'That username or password is not right.',
      values: { identifier },
      redirectTo,
    });
  }

  await startSession(req, user);
  res.redirect(redirectTo || '/');
}

export function showRegister(req, res) {
  res.render('pages/register', { title: 'Create your channel', error: null, values: {} });
}

export async function register(req, res) {
  const body = req.body ?? {};
  const values = {
    username: formText(body.username).toLowerCase(),
    email: formText(body.email).toLowerCase(),
  };
  const password = typeof body.password === 'string' ? body.password : '';
  const fail = (status, error) =>
    res.status(status).render('pages/register', { title: 'Create your channel', error, values });

  if (password.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return fail(400, `Passwords need ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_BYTES} characters.`);
  }

  const user = new User({
    username: values.username,
    displayName: values.username,
    email: values.email,
    passwordHash: 'pending',
    streamKey: generateStreamKey(),
  });
  // Check the form before hashing, because hashing is deliberately slow.
  const validationError = user.validateSync();
  if (validationError) return fail(400, firstValidationMessage(validationError));

  user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    await user.save();
  } catch (error) {
    if (error.code === 11000) {
      const takenMessage = error.keyPattern?.email
        ? 'An account with that email already exists.'
        : 'That username is taken.';
      return fail(409, takenMessage);
    }
    throw error;
  }

  await startSession(req, user);
  setFlash(req, 'success', 'Your channel is ready! Fill in your profile, then go live with OBS.');
  res.redirect('/dashboard');
}

export function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(SESSION_COOKIE);
    res.redirect('/');
  });
}

// A fresh session id on login prevents session fixation attacks.
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.userId = String(user._id);
      resolve();
    });
  });
}

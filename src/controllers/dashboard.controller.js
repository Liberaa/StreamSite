import mongoose from 'mongoose';
import { CATEGORIES } from '../config/categories.js';
import { setFlash } from '../middleware/flash.js';
import { MAX_LINKS, User } from '../models/User.js';
import { ffmpegPath } from '../services/ffmpeg.js';
import { ingestUrl, phoneIngestUrl, phoneSiteUrl } from '../services/mediaUrls.js';
import { getViewerCount } from '../services/presence.js';
import { streamEvents, streamSummary } from '../services/streamEvents.js';
import { firstValidationMessage, formList, formText } from '../utils/forms.js';
import { generateStreamKey, obsStreamKey } from '../utils/streamKey.js';

export async function show(req, res) {
  const user = await User.findById(req.user._id).select('+streamKey').lean();
  res.render('pages/dashboard', {
    title: 'Creator dashboard',
    user,
    categories: CATEGORIES,
    maxLinks: MAX_LINKS,
    ingestUrl: ingestUrl(req),
    phoneIngestUrl: phoneIngestUrl(req),
    phoneSiteUrl: phoneSiteUrl(),
    obsStreamKey: obsStreamKey(user.username, user.streamKey),
    viewerCount: getViewerCount(user.username),
  });
}

/** "Go live from this device": camera streaming in the browser, made for phones. */
export async function showBroadcast(req, res) {
  const user = await User.findById(req.user._id).lean();
  res.render('pages/broadcast', {
    title: 'Go live',
    user,
    available: Boolean(ffmpegPath),
    phoneSiteUrl: phoneSiteUrl(),
    viewerCount: getViewerCount(user.username),
  });
}

export async function updateStream(req, res) {
  const body = req.body ?? {};
  const user = await User.findById(req.user._id);
  user.stream.title = formText(body.title);
  user.stream.category = formText(body.category);

  if (!(await saveOrFlash(req, user))) return res.redirect('/dashboard');

  // Viewers on the channel page see the new title right away.
  streamEvents.emit('info', streamSummary(user.username, user.stream));
  setFlash(req, 'success', 'Stream info saved.');
  res.redirect('/dashboard');
}

export async function updateProfile(req, res) {
  const body = req.body ?? {};
  const user = await User.findById(req.user._id);
  user.displayName = formText(body.displayName) || user.username;
  user.bio = formText(body.bio);
  user.accentColor = formText(body.accentColor) || user.accentColor;
  user.links = readLinks(body.linkLabel, body.linkUrl);

  if (!(await saveOrFlash(req, user))) return res.redirect('/dashboard');
  setFlash(req, 'success', 'Profile saved.');
  res.redirect('/dashboard');
}

export async function resetStreamKey(req, res) {
  await User.updateOne({ _id: req.user._id }, { $set: { streamKey: generateStreamKey() } });
  // Ends a stream that is still running with the old key.
  streamEvents.emit('keyRevoked', { username: req.user.username });
  setFlash(req, 'success', 'New stream key created. Paste it into OBS; the old one no longer works.');
  res.redirect('/dashboard');
}

/** Saves the user, or flashes the first validation problem and returns false. */
async function saveOrFlash(req, user) {
  try {
    await user.save();
    return true;
  } catch (error) {
    if (!(error instanceof mongoose.Error.ValidationError)) throw error;
    setFlash(req, 'error', firstValidationMessage(error));
    return false;
  }
}

/** Turns the label and URL inputs into [{ label, url }], skipping empty rows. */
function readLinks(labels, urls) {
  const labelList = formList(labels);
  const links = [];
  formList(urls).slice(0, MAX_LINKS).forEach((rawUrl, index) => {
    const url = withProtocol(formText(rawUrl));
    if (!url) return;
    links.push({ label: formText(labelList[index]) || hostnameOf(url), url });
  });
  return links;
}

// "youtube.com/@me" -> "https://youtube.com/@me"
function withProtocol(url) {
  if (!url || /^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').slice(0, 30);
  } catch {
    return 'Link';
  }
}

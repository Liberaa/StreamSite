import { Follow } from '../models/Follow.js';
import { User, USERNAME_PATTERN } from '../models/User.js';
import { playbackUrl } from '../services/mediaUrls.js';
import { getViewerCount } from '../services/presence.js';
import { wantsJson } from '../utils/http.js';

export async function show(req, res, next) {
  const requested = req.params.username;
  const username = requested.toLowerCase();
  if (!USERNAME_PATTERN.test(username)) return next(); // Not a channel URL: 404.
  if (requested !== username) return res.redirect(301, `/${username}`);

  const creator = await User.findOne({ username }).lean();
  if (!creator) return next();

  const isOwner = Boolean(req.user?._id.equals(creator._id));
  const isFollowing = req.user && !isOwner
    ? Boolean(await Follow.exists({ follower: req.user._id, creator: creator._id }))
    : false;

  res.render('pages/channel', {
    title: creator.displayName,
    creator,
    isOwner,
    isFollowing,
    viewerCount: getViewerCount(username),
    playbackUrl: playbackUrl(req, username),
  });
}

export async function follow(req, res, next) {
  const creator = await findCreator(req.params.username);
  if (!creator) return next();
  if (creator._id.equals(req.user._id)) {
    if (wantsJson(req)) return res.status(400).json({ error: 'You cannot follow yourself.' });
    return res.redirect(`/${creator.username}`);
  }

  const pair = { follower: req.user._id, creator: creator._id };
  try {
    const result = await Follow.updateOne(pair, { $setOnInsert: pair }, { upsert: true });
    if (result.upsertedCount === 1) {
      await User.updateOne({ _id: creator._id }, { $inc: { followerCount: 1 } });
    }
  } catch (error) {
    if (error.code !== 11000) throw error; // 11000 means a double click already followed.
  }
  await sendFollowState(req, res, creator, true);
}

export async function unfollow(req, res, next) {
  const creator = await findCreator(req.params.username);
  if (!creator) return next();

  const result = await Follow.deleteOne({ follower: req.user._id, creator: creator._id });
  if (result.deletedCount === 1) {
    await User.updateOne({ _id: creator._id }, { $inc: { followerCount: -1 } });
  }
  await sendFollowState(req, res, creator, false);
}

function findCreator(username) {
  const normalized = String(username).toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) return null;
  return User.findOne({ username: normalized }).select('_id username').lean();
}

async function sendFollowState(req, res, creator, following) {
  if (!wantsJson(req)) return res.redirect(`/${creator.username}`);
  const { followerCount } = await User.findById(creator._id).select('followerCount').lean();
  res.json({ following, followerCount });
}

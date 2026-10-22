import { User } from '../models/User.js';
import { getViewerCount } from '../services/presence.js';

const CARD_FIELDS = 'username displayName bio accentColor followerCount stream';

export async function index(req, res) {
  const [liveChannels, creators] = await Promise.all([
    User.find({ 'stream.isLive': true }).select(CARD_FIELDS).limit(60).lean(),
    User.find().select(CARD_FIELDS).sort({ 'stream.isLive': -1, followerCount: -1, createdAt: -1 }).limit(24).lean(),
  ]);

  for (const channel of liveChannels) channel.viewerCount = getViewerCount(channel.username);
  liveChannels.sort((a, b) => b.viewerCount - a.viewerCount);

  res.render('pages/home', { title: 'Live creators', liveChannels, creators });
}

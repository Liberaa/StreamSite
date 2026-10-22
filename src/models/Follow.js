import mongoose from 'mongoose';

// One document per "viewer follows creator" pair. The running total is kept
// on User.followerCount so channel pages never have to count documents.
const followSchema = new mongoose.Schema(
  {
    follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
);

followSchema.index({ follower: 1, creator: 1 }, { unique: true });

export const Follow = mongoose.model('Follow', followSchema);

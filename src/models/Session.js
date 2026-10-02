import mongoose from 'mongoose';

/** One row per issued refresh token, so a single device can be logged out. */
const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Mongo purges expired sessions on its own, same trick as the urls TTL index.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = mongoose.model('Session', sessionSchema);
export default Session;

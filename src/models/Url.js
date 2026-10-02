import mongoose from 'mongoose';
import config from '../config/env.js';
import { isValidAlias } from '../utils/generateCode.js';

const urlSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    longUrl: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    customAlias: { type: Boolean, default: false },
    title: { type: String, trim: true, maxlength: 200, default: null },

    // TTL index: Mongo removes the document once expiresAt passes, so expired
    // links stop resolving without any cron job.
    expiresAt: { type: Date, default: null },

    maxClicks: { type: Number, default: null, min: 1 },
    totalClicks: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

urlSchema.index({ userId: 1, createdAt: -1 });
urlSchema.index({ userId: 1, isActive: 1 });

/** Virtual flags, evaluated on read so they never go stale in the document. */
urlSchema.virtual('isExpired').get(function isExpired() {
  return Boolean(this.expiresAt && this.expiresAt.getTime() <= Date.now());
});

urlSchema.virtual('isExhausted').get(function isExhausted() {
  return Boolean(this.maxClicks && this.totalClicks >= this.maxClicks);
});

urlSchema.virtual('shortUrl').get(function shortUrl() {
  return `${config.baseUrl}/${this.code}`;
});

/** A link resolves only when active, unexpired and under its click cap. */
urlSchema.methods.isResolvable = function isResolvable() {
  return this.isActive && !this.isExpired && !this.isExhausted;
};

urlSchema.pre('validate', function validateAlias(next) {
  // Belt-and-braces: the route already validates aliases with Zod, but the model
  // is the last line of defence for anything writing to it directly (seeds, scripts).
  if (this.code && this.customAlias && !isValidAlias(this.code)) {
    this.invalidate('code', `Invalid custom alias: ${this.code}`);
  }
  next();
});

const Url = mongoose.model('Url', urlSchema);
export default Url;

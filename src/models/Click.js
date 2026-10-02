import mongoose from 'mongoose';

const clickSchema = new mongoose.Schema(
  {
    urlId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Url',
      required: true,
      index: true,
    },
    timestamp: { type: Date, default: Date.now, index: true },
    visitorHash: { type: String, default: null },
    country: { type: String, default: null },
    city: { type: String, default: null },
    device: { type: String, default: 'other' },
    browser: { type: String, default: null },
    os: { type: String, default: null },
    referrer: { type: String, default: null },
    isBot: { type: Boolean, default: false, index: true },
  },
  {
    // Every click is immutable and only ever queried, never updated.
    versionKey: false,
    timestamps: { createdAt: false, updatedAt: false },
  }
);

// Blueprint's compound index: powers both the timeseries window query and
// "latest N clicks for this link" reads.
clickSchema.index({ urlId: 1, timestamp: -1 });
// Partial index so the daily_stats rollups only ever scan human clicks.
clickSchema.index({ urlId: 1, isBot: 1, timestamp: -1 });

const Click = mongoose.model('Click', clickSchema);
export default Click;
